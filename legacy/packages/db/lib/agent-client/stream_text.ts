import type {
  UIMessage as AIUIMessage,
  StepResult,
  ToolSet,
  UIMessageChunk,
} from "ai";
import { streamText as streamTextAi } from "ai";

import type { StreamingOptions } from "./delta_streamer";
import type { Agent } from "./index";
import type {
  ActionCtx,
  AgentPrompt,
  GenerationOutputMetadata,
  Options,
  Output,
} from "./types";
import { getModelName, getProviderName } from "../../src/agent/shared";
import { compressUIMessageChunks } from "./compress";
import { DeltaStreamer, mergeTransforms } from "./delta_streamer";
import { startGeneration } from "./start";
import { errorToString, willContinue } from "./utils";

type StreamCallOptions = Options & {
  agentName: string;
  userId?: string | null;
  threadId?: string;
  /**
   * Whether to save incremental data (deltas) from streaming responses.
   * Defaults to false.
   * If false, it will not save any deltas to the database.
   * If true, it will save deltas with {@link DEFAULT_STREAMING_OPTIONS}.
   *
   * Regardless of this option, when streaming you are able to use this
   * `streamText` function as you would with the "ai" package's version:
   * iterating over the text, streaming it over HTTP, etc.
   */
  saveStreamDeltas?: boolean | StreamingOptions;
  agentForToolCtx?: Agent;
};

/**
 * This behaves like {@link streamText} from the "ai" package except that
 * it add context based on the userId and threadId and saves the input and
 * resulting messages to the thread, if specified.
 * Use {@link continueThread} to get a version of this function already scoped
 * to a thread (and optionally userId).
 */
export async function streamText<
  TOOLS extends ToolSet,
  OUTPUT extends Output = never,
>(
  ctx: ActionCtx,
  /**
   * The arguments to the streamText function, similar to the ai sdk's
   * {@link streamText} function, along with Agent prompt options.
   */
  streamTextArgs: AgentPrompt &
    Omit<
      Parameters<typeof streamTextAi<TOOLS, OUTPUT>>[0],
      "model" | "prompt" | "messages"
    > & {
      /**
       * The tools to use for the tool calls. This will override tools specified
       * in the Agent constructor or createThread / continueThread.
       */
      tools?: TOOLS;
    },
  /**
   * The {@link ContextOptions} and {@link StorageOptions}
   * options to use for fetching contextual messages and saving input/output messages.
   */
  options: StreamCallOptions,
) {
  const { threadId } = options;
  const { args, userId, order, stepOrder, promptMessageId, ...call } =
    await startGeneration(ctx, streamTextArgs, options);

  // eslint-disable-next-line no-restricted-syntax -- empty array initializer needs annotation so push targets typecheck against StepResult<TOOLS>
  const steps: StepResult<TOOLS>[] = [];
  // Track the final step for atomic save with stream finish (issue #181)
  let pendingFinalStep: StepResult<TOOLS> | undefined;

  const streamer = createDeltaStreamer<TOOLS>({
    threadId,
    options,
    args,
    ctx,
    userId,
    order,
    stepOrder,
    onAsyncAbort: call.fail,
  });

  const result = streamTextAi({
    ...args,
    abortSignal: streamer?.abortController.signal ?? args.abortSignal,
    experimental_transform: mergeTransforms(
      options.saveStreamDeltas,
      streamTextArgs.experimental_transform,
    ),
    onError: async (error) => {
      console.error("onError", error);
      await call.fail(errorToString(error.error));
      await streamer?.fail(errorToString(error.error));
      return streamTextArgs.onError?.(error);
    },
    prepareStep: async (stepOptions) => {
      const stepResult = await streamTextArgs.prepareStep?.(stepOptions);
      if (stepResult) {
        const model = stepResult.model ?? stepOptions.model;
        call.updateModel(model);
        return stepResult;
      }
      return undefined;
    },
    onStepFinish: async (step) => {
      steps.push(step);
      const createPendingMessage = await willContinue(steps, args.stopWhen);
      if (!createPendingMessage && streamer) {
        // This is the final step with streaming enabled.
        // Defer saving until stream consumption completes for atomic finish (issue #181).
        streamer.markFinishedExternally();
        pendingFinalStep = step;
      } else {
        await call.save({ step }, createPendingMessage);
      }
      return args.onStepFinish?.(step);
    },
  });

  const stream = streamer?.consumeStream(
    result.toUIMessageStream<AIUIMessage<TOOLS>>(),
  );
  if (shouldAwaitStream(options)) {
    await awaitStreamCompletion({
      stream,
      result,
      streamer,
      call,
      getPendingFinalStep: () => pendingFinalStep,
    });
  }

  // If we deferred the final step save, do it now with atomic stream finish.
  if (pendingFinalStep && streamer) {
    const finishStreamId = await streamer.getOrCreateStreamId();
    await call.save({ step: pendingFinalStep }, false, finishStreamId);
  }
  const metadata = {
    promptMessageId,
    order,
    savedMessages: call.getSavedMessages(),
    messageId: promptMessageId,
  } satisfies GenerationOutputMetadata;
  return Object.assign(result, metadata);
}

function shouldAwaitStream(options: StreamCallOptions) {
  if (options.saveStreamDeltas === true) return true;
  if (
    typeof options.saveStreamDeltas === "object" &&
    !options.saveStreamDeltas.returnImmediately
  ) {
    return true;
  }
  return false;
}

interface AwaitStreamArgs<TOOLS extends ToolSet> {
  stream: Promise<void> | undefined;
  result: { consumeStream: () => PromiseLike<void> };
  streamer: DeltaStreamer<UIMessageChunk> | undefined;
  // Getter so we read the latest value after the stream has been consumed —
  // onStepFinish sets this in the caller's scope during the awaits below.
  getPendingFinalStep: () => StepResult<TOOLS> | undefined;
  call: {
    save: (
      args: { step: StepResult<TOOLS> },
      createPendingMessage: boolean,
      streamId?: string,
    ) => Promise<unknown>;
  };
}

async function awaitStreamCompletion<TOOLS extends ToolSet>({
  stream,
  result,
  streamer,
  getPendingFinalStep,
  call,
}: AwaitStreamArgs<TOOLS>) {
  try {
    await stream;
    await result.consumeStream();
  } catch (e) {
    // If the stream errored (e.g. onStepFinish threw), the DeltaStreamer's
    // finish() was never called, leaving the streaming message stuck in
    // "streaming" state. Clean it up by marking it as aborted.
    await streamer?.fail(e instanceof Error ? e.message : String(e));
    // Save the deferred final step if it was already generated but not yet persisted
    const pendingFinalStep = getPendingFinalStep();
    if (pendingFinalStep) {
      try {
        await call.save({ step: pendingFinalStep }, false);
      } catch (saveError) {
        console.error("Failed to save deferred final step:", saveError);
      }
    }
    throw e;
  }
}

interface CreateDeltaStreamerArgs {
  threadId: string | undefined;
  options: StreamCallOptions;
  args: {
    model: Parameters<typeof getModelName>[0];
    providerOptions?: Record<string, Record<string, unknown>> | undefined;
    abortSignal?: AbortSignal;
  };
  ctx: ActionCtx;
  userId: string | undefined;
  order: number;
  stepOrder: number;
  onAsyncAbort: (reason: string) => Promise<void>;
}

function createDeltaStreamer<_TOOLS extends ToolSet>({
  threadId,
  options,
  args,
  ctx,
  userId,
  order,
  stepOrder,
  onAsyncAbort,
}: CreateDeltaStreamerArgs) {
  if (!threadId || !options.saveStreamDeltas) return undefined;
  return new DeltaStreamer(
    ctx,
    {
      throttleMs:
        typeof options.saveStreamDeltas === "object"
          ? options.saveStreamDeltas.throttleMs
          : undefined,
      onAsyncAbort,
      compress: compressUIMessageChunks,
      abortSignal: args.abortSignal,
    },
    {
      threadId,
      userId,
      agentName: options.agentName,
      model: getModelName(args.model),
      provider: getProviderName(args.model),
      providerOptions: args.providerOptions,
      format: "UIMessageChunk",
      order,
      stepOrder,
    },
  );
}

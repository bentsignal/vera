import type { GatewayProviderOptions } from "@ai-sdk/gateway";
import type { OpenRouterProviderOptions } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import z from "zod";

import type { ActionCtx } from "../../_generated/server";
import type { Agent } from "../../../lib/agent-client";
import type { EventDraft } from "./stream_event";
import { getModel } from "../models/helpers";
import { modelPresets } from "../models/presets";
import { followUpGeneratorPrompt } from "../prompts";
import {
  clearEventsForGeneration,
  makeOnChunk,
  saveFollowUps,
  wasAborted,
  writeSystemError,
} from "./convex_calls";
import { ErrorCode } from "./error_codes";
import {
  ConvexCallError,
  EarlyAborted,
  errorCodeFor,
  FollowUpGenerationError,
  StreamConsumeError,
  StreamInitError,
  UserAborted,
} from "./errors";
import {
  causeMessage,
  emitStreamEvent,
  makeEventDraft,
  timed,
  updateEvent,
} from "./stream_event";

export interface StreamResponseArgs {
  readonly threadId: string;
  readonly promptMessageId: string;
  readonly generationId: string;
  readonly model?: string | undefined;
  readonly userId: string;
  readonly userPlan?: string | undefined;
}

interface StreamTextHandle {
  readonly consumeStream: () => PromiseLike<void>;
  readonly text: PromiseLike<string>;
}

const ABORT_POLL_INTERVAL_MS = 500;

async function streamText(
  ctx: ActionCtx,
  agent: Agent,
  args: StreamResponseArgs & { readonly controller: AbortController },
) {
  const resolvedModel = getModel(args.model);
  const { thread } = agent.continueThread(ctx, { threadId: args.threadId });
  const onChunk = makeOnChunk(ctx, args);
  try {
    return await thread.streamText(
      {
        model: resolvedModel.model,
        promptMessageId: args.promptMessageId,
        maxOutputTokens: 64000,
        abortSignal: args.controller.signal,
        providerOptions: {
          openrouter: {
            reasoning: { max_tokens: 32000 },
          } as const satisfies OpenRouterProviderOptions,
          gateway: {} as const satisfies GatewayProviderOptions,
        },
        onChunk,
      },
      { saveStreamDeltas: true },
    );
  } catch (cause) {
    throw new StreamInitError({ cause, model: args.model ?? "default" });
  }
}

async function consumeStream(handle: StreamTextHandle) {
  try {
    await handle.consumeStream();
  } catch (cause) {
    throw new StreamConsumeError({ cause });
  }
}

async function generateFollowUps(
  ctx: ActionCtx,
  args: { threadId: string; responseText: PromiseLike<string> },
) {
  try {
    const responseMessage = await args.responseText;
    const { object: followUpQuestions } = await generateObject({
      model: modelPresets.followUp.model,
      prompt: responseMessage,
      system: followUpGeneratorPrompt,
      schema: z.object({
        questions: z.array(z.string().max(300)).max(3),
      }),
      maxOutputTokens: 1000,
      maxRetries: 3,
    });
    await saveFollowUps(ctx, {
      threadId: args.threadId,
      followUpQuestions: followUpQuestions.questions,
    });
  } catch (cause) {
    throw new FollowUpGenerationError({ cause });
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function abortWatcher(args: {
  ctx: ActionCtx;
  threadId: string;
  generationId: string;
  controller: AbortController;
  shouldStop: () => boolean;
}) {
  while (!args.shouldStop()) {
    await sleep(ABORT_POLL_INTERVAL_MS);
    if (args.shouldStop()) return;
    const aborted = await wasAborted(args.ctx, {
      threadId: args.threadId,
      generationId: args.generationId,
    });
    if (aborted) {
      if (!args.controller.signal.aborted) args.controller.abort();
      throw new UserAborted();
    }
  }
}

async function runScoped(
  ctx: ActionCtx,
  agent: Agent,
  args: StreamResponseArgs,
  draft: EventDraft,
) {
  const { threadId, promptMessageId, generationId, model } = args;
  const abortedEarly = await wasAborted(ctx, { threadId, generationId });
  if (abortedEarly) throw new EarlyAborted();

  const controller = new AbortController();
  let stopAbortWatcher = false;
  const abortPromise = abortWatcher({
    ctx,
    threadId,
    generationId,
    controller,
    shouldStop: () => stopAbortWatcher,
  });

  async function mainWork() {
    const handle = await timed(draft, "initDurationMs", () =>
      streamText(ctx, agent, {
        threadId,
        promptMessageId,
        generationId,
        model,
        controller,
        userId: args.userId,
        userPlan: args.userPlan,
      }),
    );

    await timed(draft, "consumeDurationMs", () => consumeStream(handle));

    await timed(draft, "followUpsDurationMs", async () => {
      updateEvent(draft, { followUpsAttempted: true });
      try {
        await generateFollowUps(ctx, { threadId, responseText: handle.text });
        updateEvent(draft, { followUpsSucceeded: true });
      } catch (e) {
        if (e instanceof FollowUpGenerationError) {
          updateEvent(draft, {
            followUpsErrorMessage: causeMessage(e.cause),
          });
          return;
        }
        throw e;
      }
    });
  }

  try {
    await Promise.race([mainWork(), abortPromise]);
  } finally {
    stopAbortWatcher = true;
    abortPromise.catch(() => undefined);
    if (!controller.signal.aborted) controller.abort();
  }
}

export async function runStreamResponse(
  ctx: ActionCtx,
  agent: Agent,
  args: StreamResponseArgs,
) {
  const { threadId, generationId, model } = args;
  const resolvedModel = model ?? "default";
  const draft = makeEventDraft({ ...args, resolvedModel });

  try {
    await runScoped(ctx, agent, args, draft);
  } catch (e) {
    if (e instanceof StreamInitError) {
      const code = errorCodeFor(e);
      updateEvent(draft, {
        outcome: "error",
        errorCode: code,
        errorTag: e._tag,
        errorMessage: causeMessage(e.cause),
      });
      await writeSystemError(ctx, { threadId, generationId, code });
    } else if (e instanceof StreamConsumeError) {
      const code = errorCodeFor(e);
      updateEvent(draft, {
        outcome: "error",
        errorCode: code,
        errorTag: e._tag,
        errorMessage: causeMessage(e.cause),
      });
      await writeSystemError(ctx, { threadId, generationId, code });
    } else if (e instanceof ConvexCallError) {
      const code = errorCodeFor(e);
      updateEvent(draft, {
        outcome: "error",
        errorCode: code,
        errorTag: e._tag,
        errorMessage: causeMessage(e.cause),
        errorOp: e.op,
      });
      await writeSystemError(ctx, { threadId, generationId, code });
    } else if (e instanceof UserAborted) {
      updateEvent(draft, { outcome: "user_aborted" });
    } else if (e instanceof EarlyAborted) {
      updateEvent(draft, { outcome: "early_aborted" });
    } else {
      const code = ErrorCode.InternalDefect;
      updateEvent(draft, {
        outcome: "error",
        errorCode: code,
        errorTag: "Defect",
        errorMessage: causeMessage(e),
      });
      await writeSystemError(ctx, { threadId, generationId, code });
    }
  } finally {
    try {
      await clearEventsForGeneration(ctx, generationId);
    } catch (cause) {
      console.error("clear-events-for-generation failed", { cause });
    }
    emitStreamEvent(draft);
  }
}

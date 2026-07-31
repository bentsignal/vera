import type {
  CallSettings,
  IdGenerator,
  LanguageModel,
  ModelMessage,
  StopCondition,
  ToolSet,
} from "ai";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import { stepCountIs } from "ai";
import { assert, omit } from "convex-helpers";

import type { ModelOrMetadata } from "../../src/agent/shared";
import type { ToolCtx } from "../../src/agent/tools";
import type { Message } from "../../src/agent/validators";
import type { Agent } from "./index";
import type { ActionCtx, Config, Options } from "./types";
import { internal } from "../../src/_generated/api";
import { wrapTools } from "../../src/agent/tools";
import { asId } from "./_ids";
import { fetchContextWithPrompt } from "./search";
import { resolveInputs, resolveUserId } from "./start/resolve";
import { createSaveHandler } from "./start/save";

function makeModelRef(initial: ModelOrMetadata) {
  return { current: initial };
}

/**
 * Widen a narrowed `ActionCtx` back to the full `GenericActionCtx` shape
 * required by `ToolCtx`. `ActionCtx` is a structural subset of
 * `GenericActionCtx`; we never add missing methods here, we just restore
 * the type so tool definitions can access `ctx.db`, `ctx.scheduler`, etc.
 */
function widenActionCtx<CustomCtx extends object>(ctx: ActionCtx & CustomCtx) {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- ActionCtx is a Pick<> of GenericActionCtx; this restores the full shape for ToolCtx.
  return ctx as unknown as GenericActionCtx<GenericDataModel> & CustomCtx;
}

/**
 * Re-narrow the generic `ToolSet` returned by `wrapTools` to the caller's
 * concrete `Tools` generic. `wrapTools` preserves tool identities at
 * runtime; the type signature just can't thread the generic through.
 */
function narrowTools<Tools extends ToolSet>(tools: ToolSet) {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- wrapTools is identity-preserving at runtime; re-narrow to caller's Tools.
  return tools as Tools;
}

interface BuildAiArgsParams<T, Tools extends ToolSet> {
  args: T & StartGenerationArgs<Tools>;
  opts: Pick<
    StartGenerationOptions,
    "callSettings" | "providerOptions" | "maxSteps"
  >;
  model: LanguageModel;
  messages: ModelMessage[];
  tools: Tools;
}

function buildAiArgs<T, Tools extends ToolSet>({
  args,
  opts,
  model,
  messages,
  tools,
}: BuildAiArgsParams<T, Tools>) {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Composing provider/call settings with the caller's generic `T` requires a structural widening the compiler cannot infer through `omit`.
  return {
    ...opts.callSettings,
    providerOptions: opts.providerOptions,
    ...omit(args, ["promptMessageId", "messages", "prompt"]),
    model,
    messages,
    stopWhen:
      args.stopWhen ?? (opts.maxSteps ? stepCountIs(opts.maxSteps) : undefined),
    tools,
  } as AiArgs<T, Tools>;
}

/**
 * Wire an AbortSignal to the generation's `fail` closure so external
 * aborts finalize the pending message as failed.
 */
function attachAbort(
  abortSignal: AbortSignal,
  fail: (reason: string) => Promise<void>,
) {
  abortSignal.addEventListener(
    "abort",
    () => {
      const reason =
        abortSignal.reason instanceof Error
          ? abortSignal.reason.message
          : String(abortSignal.reason ?? "abortSignal");
      void fail(reason);
    },
    { once: true },
  );
}

export interface StartGenerationArgs<Tools extends ToolSet> {
  /**
   * If provided, this message will be used as the "prompt" for the LLM
   * call, instead of the prompt or messages. This is useful if you want to
   * first save a user message, then use it as the prompt for the LLM call
   * in another call.
   */
  promptMessageId?: string;
  /**
   * The model to use for the LLM calls. This will override the model
   * specified in the Agent constructor.
   */
  model?: LanguageModel;
  /**
   * The tools to use for the tool calls. This will override tools specified
   * in the Agent constructor or createThread / continueThread.
   */
  tools?: Tools;
  /**
   * The single prompt message to use for the LLM call. This will be the
   * last message in the context. If it's a string, it will be a user role.
   */
  prompt?: string | (ModelMessage | Message)[];
  /**
   * If provided alongside prompt, the ordering will be:
   * 1. system prompt
   * 2. search context
   * 3. recent messages
   * 4. these messages
   * 5. prompt messages, including those already on the same `order` as
   *   the promptMessageId message, if provided.
   */
  messages?: (ModelMessage | Message)[];
  /**
   * The abort signal to be passed to the LLM call. If triggered, it marks
   * the pending message as failed. If the generation is asynchronously
   * aborted, it will trigger this signal when detected.
   */
  abortSignal?: AbortSignal;
  stopWhen?: StopCondition<Tools> | StopCondition<Tools>[];
  _internal?: { generateId?: IdGenerator };
}

export interface StartGenerationOptions extends Options, Config {
  userId?: string | null;
  threadId?: string;
  languageModel?: LanguageModel;
  agentName: string;
  agentForToolCtx?: Agent;
}

type AiArgs<T, Tools extends ToolSet> = T & {
  system?: string;
  model: LanguageModel;
  messages: ModelMessage[];
  prompt?: never;
  tools?: Tools;
} & CallSettings;

export async function startGeneration<
  T,
  Tools extends ToolSet = ToolSet,
  CustomCtx extends object = object,
>(
  ctx: ActionCtx & CustomCtx,
  /**
   * These are the arguments you'll pass to the LLM call such as
   * `generateText` or `streamText`. This function looks up the context and
   * provides functions to save the steps, abort the generation, and more.
   */
  args: T & StartGenerationArgs<Tools>,
  { threadId, ...opts }: StartGenerationOptions,
) {
  const userId = await resolveUserId(ctx, opts, threadId);

  const context = await fetchContextWithPrompt(ctx, {
    ...opts,
    userId,
    threadId,
    messages: args.messages,
    prompt: args.prompt,
    promptMessageId: args.promptMessageId,
  });

  const { promptMessageId, pendingMessage, savedMessages } =
    await resolveInputs(
      ctx,
      {
        prompt: args.prompt,
        messages: args.messages,
        promptMessageId: args.promptMessageId,
      },
      { ...opts, userId, threadId },
    );

  const order = pendingMessage?.order ?? context.order;
  const stepOrder = pendingMessage?.stepOrder ?? context.stepOrder;

  const model = args.model ?? opts.languageModel;
  assert(model, "model is required");
  // Mutable holder widened to ModelOrMetadata so `updateModel` can swap in
  // a string-based model reference mid-generation (e.g. from prepareStep).
  const activeModelRef = makeModelRef(model);
  // Shared mutable handle so `fail` always targets the latest pending
  // message id (the save closure updates it across streamed steps).
  const pendingRef = { id: pendingMessage?._id };

  async function fail(reason: string) {
    if (pendingRef.id) {
      await ctx.runMutation(internal.agent.messages.finalizeMessage, {
        messageId: asId<"messages">(pendingRef.id),
        result: { status: "failed", error: reason },
      });
    }
  }

  if (args.abortSignal) attachAbort(args.abortSignal, fail);

  const toolCtx = {
    ...widenActionCtx<CustomCtx>(ctx),
    userId,
    threadId,
    promptMessageId,
    agent: opts.agentForToolCtx,
  } satisfies ToolCtx;
  const tools = narrowTools<Tools>(wrapTools(toolCtx, args.tools));

  const aiArgs = buildAiArgs<T, Tools>({
    args,
    opts,
    model,
    messages: context.messages,
    tools,
  });

  const save = createSaveHandler({
    ctx,
    threadId,
    userId,
    opts,
    promptMessageId,
    savedMessages,
    pendingRef,
    getActiveModel: () => activeModelRef.current,
    fail,
  });

  return {
    args: aiArgs,
    order: order ?? 0,
    stepOrder: stepOrder ?? 0,
    userId,
    promptMessageId,
    getSavedMessages: () => savedMessages,
    updateModel: (model: ModelOrMetadata | undefined) => {
      if (model) activeModelRef.current = model;
    },
    fail,
    save,
  };
}

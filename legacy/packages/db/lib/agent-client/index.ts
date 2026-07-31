import type { FlexibleSchema, IdGenerator } from "@ai-sdk/provider-utils";
import type { LanguageModel, StopCondition, ToolSet } from "ai";

import type { ProviderMetadata, StreamArgs } from "../../src/agent/validators";
import type {
  ActionCtx,
  AgentPrompt,
  Config,
  ContextOptions,
  GenerateObjectArgs,
  ObjectMode,
  Options,
  Output,
  RawRequestResponseHandler,
  StorageOptions,
  StreamingTextArgs,
  StreamObjectArgs,
  SyncStreamsReturnValue,
  TextArgs,
  Thread,
  UsageHandler,
} from "./types";
import { internal } from "../../src/_generated/api";
import { asId } from "./_ids";
import { agentStart } from "./agent/agent_start";
import { AgentBase } from "./agent/base_agent";
import {
  agentGenerateObject,
  agentGenerateText,
  agentStreamText,
} from "./agent/generation";
import { agentStreamObject } from "./agent/stream_object";
import { createThread } from "./threads";

export {
  docsToModelMessages,
  toModelMessage,
  guessMimeType,
  serializeDataOrUrl,
  serializeMessage,
  toUIFilePart,
} from "../../src/agent/mapping";
export { extractText, isTool, sorted } from "../../src/agent/shared";
export {
  vAssistantMessage,
  vContent,
  vContextOptions,
  vMessage,
  vMessageDoc,
  vPaginationResult,
  vProviderMetadata,
  vSource,
  vStorageOptions,
  vStreamArgs,
  vSystemMessage,
  vThreadDoc,
  vToolMessage,
  vUsage,
  vUserMessage,
  type Message,
  type MessageDoc,
  type SourcePart,
  type ThreadDoc,
  type Usage,
} from "../../src/agent/validators";
export { createTool, type ToolCtx } from "../../src/agent/tools";
export {
  listMessages,
  listUIMessages,
  saveMessage,
  saveMessages,
  type SaveMessageArgs,
  type SaveMessagesArgs,
} from "./messages";
export { startGeneration } from "./start";
export { compressUIMessageChunks } from "./compress";
export { DEFAULT_STREAMING_OPTIONS, DeltaStreamer } from "./delta_streamer";
export {
  abortStream,
  listStreams,
  syncStreams,
  vStreamMessagesReturnValue,
} from "./streaming";
export {
  createThread,
  getThreadMetadata,
  searchThreadTitles,
  updateThreadMetadata,
} from "./threads";
export type { ContextHandler } from "./types";
export { fromUIMessages } from "../../src/agent/ui/from_ui_messages";
export { toUIMessages } from "../../src/agent/ui/to_ui_messages";
export type { UIMessage } from "../../src/agent/ui/types";

export type {
  Config,
  ContextOptions,
  ProviderMetadata,
  RawRequestResponseHandler,
  StorageOptions,
  StreamArgs,
  SyncStreamsReturnValue,
  Thread,
  UsageHandler,
};

type JSONValue =
  | null
  | string
  | number
  | boolean
  | JSONValue[]
  | { [k: string]: JSONValue };

type AgentOptions<AgentTools extends ToolSet> = Config & {
  /** The name for the agent. Attributed on each message created by this agent. */
  name: string;
  /** The LLM model to use for generating / streaming text and objects. */
  languageModel: LanguageModel;
  /** The default system prompt to put in each request. */
  instructions?: string;
  /** Tools that the agent can call out to. */
  tools?: AgentTools;
  /** When generating or streaming text with tools, when to stop. */
  stopWhen?:
    | StopCondition<NoInfer<AgentTools>>
    | StopCondition<NoInfer<AgentTools>>[];
};

export class Agent<
  CustomCtx extends object = object,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AgentTools extends ToolSet = any,
> extends AgentBase {
  constructor(public options: AgentOptions<AgentTools>) {
    super();
  }

  async createThread(
    ctx: ActionCtx & CustomCtx,
    args?: { userId?: string | null; title?: string; summary?: string },
  ): Promise<{ threadId: string; thread: Thread<AgentTools> }> {
    const threadId = await createThread(ctx, args);
    const { thread } = this.continueThread(ctx, {
      threadId,
      userId: args?.userId,
    });
    return { threadId, thread };
  }

  continueThread(
    ctx: ActionCtx & CustomCtx,
    args: { threadId: string; userId?: string | null },
  ): { thread: Thread<AgentTools> } {
    return {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      thread: {
        threadId: args.threadId,
        getMetadata: this.getThreadMetadata.bind(this, ctx, {
          threadId: args.threadId,
        }),
        updateMetadata: (patch) =>
          ctx.runMutation(internal.agent.threads.updateThread, {
            threadId: asId<"threads">(args.threadId),
            patch,
          }),
        generateText: this.generateText.bind(this, ctx, args),
        streamText: this.streamText.bind(this, ctx, args),
        generateObject: this.generateObject.bind(this, ctx, args),
        streamObject: this.streamObject.bind(this, ctx, args),
      } as Thread<AgentTools>,
    };
  }

  async start<
    TOOLS extends ToolSet | undefined,
    T extends { _internal?: { generateId?: IdGenerator } },
  >(
    ctx: ActionCtx & CustomCtx,
    args: T &
      AgentPrompt & {
        tools?: TOOLS;
        abortSignal?: AbortSignal;
        stopWhen?:
          | StopCondition<TOOLS extends undefined ? AgentTools : TOOLS>
          | StopCondition<TOOLS extends undefined ? AgentTools : TOOLS>[];
      },
    options?: Options & { userId?: string | null; threadId?: string },
  ) {
    return agentStart<AgentTools, CustomCtx, TOOLS, T>({
      options: this.options,
      agentForToolCtx: this,
      ctx,
      args,
      callOptions: options,
    });
  }

  async generateText<
    TOOLS extends ToolSet | undefined = undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    OUTPUT extends Output<any, any, any> = never,
  >(
    ctx: ActionCtx & CustomCtx,
    threadOpts: ThreadOpts,
    generateTextArgs: AgentPrompt & TextArgs<AgentTools, TOOLS, OUTPUT>,
    options?: Options,
  ) {
    return agentGenerateText<AgentTools, CustomCtx, TOOLS, OUTPUT>({
      options: this.options,
      agentForToolCtx: this,
      ctx,
      threadOpts,
      generateTextArgs,
      callOptions: options,
    });
  }

  async streamText<
    TOOLS extends ToolSet | undefined = undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    OUTPUT extends Output<any, any, any> = never,
  >(
    ctx: ActionCtx & CustomCtx,
    threadOpts: ThreadOpts,
    streamTextArgs: AgentPrompt & StreamingTextArgs<AgentTools, TOOLS, OUTPUT>,
    options?: Parameters<
      typeof agentStreamText<AgentTools, CustomCtx, TOOLS, OUTPUT>
    >[0]["callOptions"],
  ) {
    return agentStreamText<AgentTools, CustomCtx, TOOLS, OUTPUT>({
      options: this.options,
      agentForToolCtx: this,
      ctx,
      threadOpts,
      streamTextArgs,
      callOptions: options,
    });
  }

  async generateObject<
    SCHEMA extends FlexibleSchema<unknown> = FlexibleSchema<JSONValue>,
    OUTPUT extends ObjectMode = "object",
    RESULT = unknown,
  >(
    ctx: ActionCtx & CustomCtx,
    threadOpts: ThreadOpts,
    generateObjectArgs: AgentPrompt &
      GenerateObjectArgs<SCHEMA, OUTPUT, RESULT>,
    options?: Options,
  ) {
    return agentGenerateObject<AgentTools, CustomCtx, SCHEMA, OUTPUT, RESULT>({
      options: this.options,
      agentForToolCtx: this,
      ctx,
      threadOpts,
      generateObjectArgs,
      callOptions: options,
    });
  }

  async streamObject<
    SCHEMA extends FlexibleSchema<unknown> = FlexibleSchema<JSONValue>,
    OUTPUT extends ObjectMode = "object",
    RESULT = unknown,
  >(
    ctx: ActionCtx & CustomCtx,
    threadOpts: ThreadOpts,
    streamObjectArgs: AgentPrompt & StreamObjectArgs<SCHEMA, OUTPUT, RESULT>,
    options?: Options,
  ) {
    return agentStreamObject<AgentTools, CustomCtx, SCHEMA, OUTPUT, RESULT>({
      options: this.options,
      agentForToolCtx: this,
      ctx,
      threadOpts,
      streamObjectArgs,
      callOptions: options,
    });
  }
}

interface ThreadOpts {
  userId?: string | null;
  threadId?: string;
}

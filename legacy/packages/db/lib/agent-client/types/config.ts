import type { ModelMessage, ProviderOptions } from "@ai-sdk/provider-utils";
import type { CallSettings, EmbeddingModel, LanguageModel } from "ai";

import type { MessageDoc } from "../../../src/agent/validators";
import type {
  ContextHandler,
  RawRequestResponseHandler,
  UsageHandler,
} from "./handlers";

export interface AgentPrompt {
  /**
   * System message to include in the prompt. Overwrites Agent instructions.
   */
  system?: string;
  /**
   * A prompt. Either a text prompt or a list of messages. If used with
   * `promptMessageId`, it will be used in place of that prompt message and
   * no input messages will be saved. Otherwise, with the storageOptions
   * "promptAndOutput" (default), it will be the only message saved. A
   * string is treated as a user message.
   */
  prompt?: string | ModelMessage[] | undefined;
  /**
   * A list of messages to use as context before the prompt. If used with
   * `prompt`, these will precede the prompt. With the storageOptions
   * "promptAndOutput" (default), none of these messages will be saved.
   */
  messages?: ModelMessage[] | undefined;
  /**
   * If provided, anchors the prompt to an existing message — that message is
   * included unless `prompt` is also provided (in which case `prompt` is
   * inserted in its place). Recent and search messages will not include
   * anything after this message's order. Sibling responses on the same order
   * (e.g. tool calls and results) are included automatically.
   *
   * If provided, no input messages will be saved by default.
   */
  promptMessageId?: string | undefined;
  /**
   * The model to use for the LLM calls. Overrides the languageModel from the
   * Agent config.
   */
  model?: LanguageModel;
}

export interface ContextOptions {
  /**
   * Whether to include tool messages in the context. Default: false.
   */
  excludeToolMessages?: boolean;
  /**
   * How many recent messages to include. Default: 100.
   */
  recentMessages?: number;
  searchOptions?: {
    /** The maximum number of messages to fetch. Default: 10. */
    limit: number;
    /** Whether to use text search to find messages. Default: false. */
    textSearch?: boolean;
    /**
     * Whether to use vector search to find messages. At least one of
     * textSearch or vectorSearch must be true. Default: false.
     */
    vectorSearch?: boolean;
    /** Score threshold for vector search. Default: 0.0. */
    vectorScoreThreshold?: number;
    /**
     * Surrounding messages to include around each search hit.
     * Default: { before: 2, after: 1 }.
     */
    messageRange?: { before: number; after: number };
  };
  /**
   * Whether to search across other threads for relevant messages. Default:
   * false (only the current thread is searched).
   */
  searchOtherThreads?: boolean;
}

export interface StorageOptions {
  /**
   * Pass "all" to save all input and output messages, "none" to skip
   * saving, or "promptAndOutput" to save the prompt and all output messages.
   * Defaults to "promptAndOutput".
   */
  saveMessages?: "all" | "none" | "promptAndOutput";
}

export interface GenerationOutputMetadata {
  promptMessageId?: string;
  /**
   * The order of the prompt message and responses for the generation. Each
   * order starts with a user message, followed by agent responses.
   */
  order?: number;
  /**
   * The messages saved for the generation — both saved input and output.
   * Excludes the message identified by promptMessageId, if provided.
   */
  savedMessages?: MessageDoc[];
  /** @deprecated Use promptMessageId instead. */
  messageId?: string;
}

export interface Config {
  /**
   * The LLM model to use for generating / streaming text and objects.
   *
   * @example
   * import { openai } from "@ai-sdk/openai"
   * const myAgent = new Agent({
   *   languageModel: openai.chat("gpt-4o-mini"),
   * })
   */
  languageModel?: LanguageModel;
  /** @deprecated Use `embeddingModel` instead. */
  textEmbeddingModel?: EmbeddingModel;
  /**
   * The model to use for text embeddings. Optional. If specified, used for
   * vector embeddings of chats; can opt-in to vector search for automatic
   * context on generateText, etc.
   */
  embeddingModel?: EmbeddingModel;
  /**
   * Options to determine what messages are included as context. To disable
   * automatic message inclusion, pass `{ recentMessages: 0 }`.
   */
  contextOptions?: ContextOptions;
  /**
   * Whether messages are automatically stored when passed as arguments or
   * generated.
   */
  storageOptions?: StorageOptions;
  usageHandler?: UsageHandler;
  /**
   * By default, messages are ordered with context in
   * `fetchContextWithPrompt`. Override by providing a context handler to
   * filter, modify, or enrich the context messages. Excludes the system
   * message / instructions.
   */
  contextHandler?: ContextHandler;
  /**
   * Called for each LLM request/response, so you can log the raw request
   * body or response headers.
   */
  rawRequestResponseHandler?: RawRequestResponseHandler;
  /**
   * Default provider options to pass for the LLM calls. Overridable per
   * field at each generate/stream callsite. Pass `undefined` to clear.
   */
  providerOptions?: ProviderOptions;
  /**
   * The default settings to use for the LLM calls. Overridable per field at
   * each generate/stream callsite. Pass `undefined` to clear.
   */
  callSettings?: CallSettings;
  /**
   * The maximum number of steps to allow for a single generation. For
   * example, a tool call + tool response is one step; generating a
   * follow-up response based on the tool call is a second step. If steps
   * run out, the last step result is returned (which may not be an
   * assistant message).
   *
   * Becomes the default value when `stopWhen` is not specified at the
   * generation callsite. Defaults to 1.
   */
  maxSteps?: number;
}

export interface Options {
  contextOptions?: ContextOptions;
  storageOptions?: StorageOptions;
  /**
   * The usage handler to use for this thread. Overrides any handler set in
   * the agent constructor.
   */
  usageHandler?: UsageHandler;
  contextHandler?: ContextHandler;
}

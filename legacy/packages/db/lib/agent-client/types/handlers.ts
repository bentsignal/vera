import type { ModelMessage } from "@ai-sdk/provider-utils";
import type {
  LanguageModelRequestMetadata,
  LanguageModelResponseMetadata,
  LanguageModelUsage,
} from "ai";

import type { ProviderMetadata } from "../../../src/agent/validators";
import type { ActionCtx } from "./ctx";

export type UsageHandler = (
  ctx: ActionCtx,
  args: {
    userId: string | undefined;
    threadId: string | undefined;
    agentName: string | undefined;
    usage: LanguageModelUsage;
    /**
     * Often has more information, like cached token usage in the case of
     * openai.
     */
    providerMetadata: ProviderMetadata | undefined;
    model: string;
    provider: string;
  },
) => void | Promise<void>;

/**
 * By default, messages are ordered with context in `fetchContextWithPrompt`,
 * but you can override this by providing a context handler. Here you can
 * filter out, add in, or reorder messages.
 */
export type ContextHandler = (
  ctx: ActionCtx,
  args: {
    /** All messages in the default order. */
    allMessages: ModelMessage[];
    /** The messages fetched from search. */
    search: ModelMessage[];
    /**
     * The recent messages already in the thread history, excluding any
     * messages that came after promptMessageId.
     */
    recent: ModelMessage[];
    /**
     * The messages passed as the `messages` argument to e.g. generateText.
     */
    inputMessages: ModelMessage[];
    /**
     * The message(s) passed as the `prompt` argument to e.g. generateText.
     * Otherwise, if `promptMessageId` was provided, the message at that id.
     * `prompt` will override the message at `promptMessageId`.
     */
    inputPrompt: ModelMessage[];
    /**
     * Any messages on the same `order` as the promptMessageId message after
     * the prompt message. These are presumably existing responses to the
     * prompt message.
     */
    existingResponses: ModelMessage[];
    userId: string | undefined;
    threadId: string | undefined;
  },
) => ModelMessage[] | Promise<ModelMessage[]>;

export type RawRequestResponseHandler = (
  ctx: ActionCtx,
  args: {
    userId: string | undefined;
    threadId: string | undefined;
    agentName: string | undefined;
    request: LanguageModelRequestMetadata;
    response: LanguageModelResponseMetadata;
  },
) => void | Promise<void>;

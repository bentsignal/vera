import type { Infer, Validator, Value } from "convex/values";
import { v } from "convex/values";

export const vProviderOptions = v.record(
  v.string(),
  v.record(v.string(), v.any()),
);
export const providerOptions = v.optional(vProviderOptions);
export type ProviderOptions = Infer<typeof providerOptions>;

export const vProviderMetadata = vProviderOptions;
export const providerMetadata = providerOptions;
export type ProviderMetadata = Infer<typeof providerMetadata>;

export const vRole = v.union(
  v.literal("system"),
  v.literal("user"),
  v.literal("assistant"),
  v.literal("tool"),
);

export const vMessageStatus = v.union(
  v.literal("pending"),
  v.literal("success"),
  v.literal("failed"),
);
export type MessageStatus = Infer<typeof vMessageStatus>;

export const vThreadStatus = v.union(
  v.literal("active"),
  v.literal("archived"),
);

export const vFinishReason = v.union(
  v.literal("stop"),
  v.literal("length"),
  v.literal("content-filter"),
  v.literal("tool-calls"),
  v.literal("error"),
  v.literal("other"),
  v.literal("unknown"),
);

export const vUsage = v.object({
  promptTokens: v.number(),
  completionTokens: v.number(),
  totalTokens: v.number(),
  reasoningTokens: v.optional(v.number()),
  cachedInputTokens: v.optional(v.number()),
});
export type Usage = Infer<typeof vUsage>;

export const vLanguageModelCallWarning = v.union(
  v.object({
    type: v.literal("unsupported-setting"),
    setting: v.string(),
    details: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("unsupported-tool"),
    tool: v.any(),
    details: v.optional(v.string()),
  }),
  v.object({ type: v.literal("other"), message: v.string() }),
);

export const vRequest = v.object({
  body: v.optional(v.any()),
  headers: v.optional(v.record(v.string(), v.string())),
  method: v.optional(v.string()),
  url: v.optional(v.string()),
});

export const vCallSettings = v.object({
  maxOutputTokens: v.optional(v.number()),
  temperature: v.optional(v.number()),
  topP: v.optional(v.number()),
  topK: v.optional(v.number()),
  presencePenalty: v.optional(v.number()),
  frequencyPenalty: v.optional(v.number()),
  stopSequences: v.optional(v.array(v.string())),
  seed: v.optional(v.number()),
  maxRetries: v.optional(v.number()),
  headers: v.optional(v.record(v.string(), v.string())),
});
export type CallSettings = Infer<typeof vCallSettings>;

export function vPaginationResult<
  T extends Validator<Value, "required", string>,
>(itemValidator: T) {
  return v.object({
    page: v.array(itemValidator),
    continueCursor: v.string(),
    isDone: v.boolean(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(
        v.literal("SplitRecommended"),
        v.literal("SplitRequired"),
        v.null(),
      ),
    ),
  });
}

export const vEventType = v.union(
  v.literal("user_message_sent"),
  v.literal("agent_working"),
  v.literal("response_streaming"),
);

export type EventType = Infer<typeof vEventType>;

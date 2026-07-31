import type { CallWarning, LanguageModelUsage } from "ai";

import type { MessageWithMetadata, Usage } from "../validators";

export function serializeUsage(usage: LanguageModelUsage) {
  return {
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
    reasoningTokens: usage.reasoningTokens,
    cachedInputTokens: usage.cachedInputTokens,
  } satisfies Usage;
}

export function toModelMessageUsage(usage: Usage) {
  return {
    inputTokens: usage.promptTokens,
    outputTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    reasoningTokens: usage.reasoningTokens,
    cachedInputTokens: usage.cachedInputTokens,
    inputTokenDetails: {
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
      noCacheTokens: undefined,
    },
    outputTokenDetails: {
      textTokens: undefined,
      reasoningTokens: undefined,
    },
  } satisfies LanguageModelUsage;
}

type SerializedWarning = NonNullable<MessageWithMetadata["warnings"]>[number];

function serializeWarning(warning: CallWarning) {
  if (warning.type === "compatibility" || warning.type === "unsupported") {
    return {
      type: "unsupported-setting" as const,
      setting: warning.feature,
      details: warning.details,
    };
  }
  return { type: "other" as const, message: warning.message };
}

export function serializeWarnings(warnings: CallWarning[] | undefined) {
  if (!warnings) return undefined;
  return warnings.map(serializeWarning);
}

function toModelMessageWarning(warning: SerializedWarning) {
  if (warning.type === "unsupported-setting") {
    return {
      type: "compatibility" as const,
      feature: warning.setting,
      details: warning.details,
    };
  }
  if (warning.type === "unsupported-tool") {
    return {
      type: "other" as const,
      message: `Unsupported tool: ${warning.details ?? "unknown"}`,
    };
  }
  return { type: "other" as const, message: warning.message };
}

export function toModelMessageWarnings(
  warnings: MessageWithMetadata["warnings"],
) {
  if (!warnings) return undefined;
  return warnings.map(toModelMessageWarning);
}

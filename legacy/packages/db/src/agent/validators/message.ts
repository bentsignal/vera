import type { Infer } from "convex/values";
import { v } from "convex/values";

import type { vImagePart } from "./content";
import type { vToolApprovalResponse } from "./tool";
import {
  vFilePart,
  vReasoningDetails,
  vReasoningPart,
  vRedactedReasoningPart,
  vSource,
  vSourcePart,
  vTextPart,
  vUserContent,
} from "./content";
import {
  providerMetadata,
  providerOptions,
  vFinishReason,
  vLanguageModelCallWarning,
  vMessageStatus,
  vUsage,
} from "./shared";
import { vSystemError, vSystemNotice } from "./system";
import {
  vToolApprovalRequest,
  vToolCallPart,
  vToolContent,
  vToolResultPart,
} from "./tool";

export const vAssistantContent = v.union(
  v.string(),
  v.array(
    v.union(
      vTextPart,
      vFilePart,
      vReasoningPart,
      vRedactedReasoningPart,
      vToolCallPart,
      vToolResultPart,
      vSourcePart,
      vToolApprovalRequest,
    ),
  ),
);

export const vContent = v.union(vUserContent, vAssistantContent, vToolContent);
export type Content = Infer<typeof vContent>;

export const vUserMessage = v.object({
  role: v.literal("user"),
  content: vUserContent,
  providerOptions,
});

export const vAssistantMessage = v.object({
  role: v.literal("assistant"),
  content: vAssistantContent,
  providerOptions,
});

export const vToolMessage = v.object({
  role: v.literal("tool"),
  content: vToolContent,
  providerOptions,
});

export const vSystemMessage = v.object({
  role: v.literal("system"),
  content: v.string(),
  providerOptions,
});

export const vMessage = v.union(
  vUserMessage,
  vAssistantMessage,
  vToolMessage,
  vSystemMessage,
);
export type Message = Infer<typeof vMessage>;

export type MessageContentParts =
  | Infer<typeof vTextPart>
  | Infer<typeof vImagePart>
  | Infer<typeof vFilePart>
  | Infer<typeof vReasoningPart>
  | Infer<typeof vRedactedReasoningPart>
  | Infer<typeof vToolCallPart>
  | Infer<typeof vToolResultPart>
  | Infer<typeof vSourcePart>
  | Infer<typeof vToolApprovalRequest>
  | Infer<typeof vToolApprovalResponse>;

export const vMessageWithMetadata = v.object({
  message: vMessage,
  text: v.optional(v.string()),
  status: v.optional(vMessageStatus),
  finishReason: v.optional(vFinishReason),
  model: v.optional(v.string()),
  provider: v.optional(v.string()),
  providerMetadata,
  sources: v.optional(v.array(vSource)),
  reasoning: v.optional(v.string()),
  reasoningDetails: v.optional(vReasoningDetails),
  notices: v.optional(v.array(vSystemNotice)),
  errors: v.optional(v.array(vSystemError)),
  usage: v.optional(vUsage),
  warnings: v.optional(v.array(vLanguageModelCallWarning)),
  error: v.optional(v.string()),
});
export type MessageWithMetadata = Infer<typeof vMessageWithMetadata>;
export type MessageWithMetadataInternal = MessageWithMetadata;

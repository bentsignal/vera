import type { Infer } from "convex/values";
import { v } from "convex/values";

import { vReasoningDetails, vSource } from "./content";
import { vMessage } from "./message";
import {
  providerOptions,
  vFinishReason,
  vLanguageModelCallWarning,
  vMessageStatus,
  vProviderMetadata,
  vThreadStatus,
  vUsage,
} from "./shared";
import { vSystemError, vSystemNotice } from "./system";

export const vMessageDoc = v.object({
  _id: v.string(),
  _creationTime: v.number(),
  userId: v.optional(v.string()),
  threadId: v.string(),
  order: v.number(),
  stepOrder: v.number(),
  error: v.optional(v.string()),
  status: vMessageStatus,

  agentName: v.optional(v.string()),
  model: v.optional(v.string()),
  provider: v.optional(v.string()),
  providerOptions,

  message: v.optional(vMessage),
  tool: v.boolean(),
  text: v.optional(v.string()),

  usage: v.optional(vUsage),
  providerMetadata: v.optional(vProviderMetadata),
  sources: v.optional(v.array(vSource)),
  warnings: v.optional(v.array(vLanguageModelCallWarning)),
  finishReason: v.optional(vFinishReason),
  reasoning: v.optional(v.string()),
  reasoningDetails: v.optional(vReasoningDetails),
  notices: v.optional(v.array(vSystemNotice)),
  errors: v.optional(v.array(vSystemError)),
  id: v.optional(v.string()),
  // Loose `v.any()` so host code is free to either pass through the raw
  // `Id<"files">[]` array (server-side) or replace it with a fully-resolved
  // attachment payload (query layer enrichment) without a validator clash.
  attachments: v.optional(v.any()),
});
export type MessageDoc = Infer<typeof vMessageDoc>;

export const vThreadDoc = v.object({
  _id: v.string(),
  _creationTime: v.number(),
  userId: v.optional(v.string()),
  title: v.optional(v.string()),
  summary: v.optional(v.string()),
  status: vThreadStatus,
  pinned: v.optional(v.boolean()),
  updatedAt: v.optional(v.number()),
  followUpQuestions: v.optional(v.array(v.string())),
});
export type ThreadDoc = Infer<typeof vThreadDoc>;

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  attachment,
  conversationKind,
  linkPreview,
  spaceRole,
} from "./protocol.ts";

export default defineSchema({
  conversations: defineTable({
    conversationId: v.string(),
    createdBy: v.string(),
    kind: conversationKind,
    name: v.optional(v.string()),
    position: v.optional(v.number()),
    spaceId: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_space", ["spaceId"]),
  // Direct and group members, plus per-account read state for channels.
  members: defineTable({
    accountId: v.string(),
    conversationId: v.string(),
    lastReadAt: v.number(),
    muted: v.boolean(),
    role: spaceRole,
  })
    .index("by_account", ["accountId"])
    .index("by_conversation_account", ["conversationId", "accountId"]),
  messages: defineTable({
    attachments: v.array(attachment),
    authorId: v.string(),
    authorName: v.string(),
    body: v.string(),
    conversationId: v.string(),
    linkPreview: v.optional(linkPreview),
    messageId: v.string(),
    sentAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_conversation_sent", ["conversationId", "sentAt"]),
  spaces: defineTable({
    createdBy: v.string(),
    name: v.string(),
    spaceId: v.string(),
  }).index("by_space", ["spaceId"]),
  spaceMembers: defineTable({
    accountId: v.string(),
    role: spaceRole,
    spaceId: v.string(),
  })
    .index("by_account", ["accountId"])
    .index("by_space_account", ["spaceId", "accountId"]),
  pushTokens: defineTable({
    accountId: v.string(),
    token: v.string(),
  })
    .index("by_account", ["accountId"])
    .index("by_token", ["token"]),
});

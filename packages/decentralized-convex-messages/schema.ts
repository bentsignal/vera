import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  conversations: defineTable({
    accountId: v.string(),
    conversationId: v.string(),
    participants: v.array(v.string()),
  }).index("by_account_conversation", ["accountId", "conversationId"]),
  messages: defineTable({
    authorId: v.string(),
    authorName: v.string(),
    body: v.string(),
    conversationId: v.string(),
    messageId: v.string(),
    sentAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_message", ["messageId"]),
});

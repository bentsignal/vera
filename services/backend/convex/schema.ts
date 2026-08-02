import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({
    author: v.string(),
    authorName: v.optional(v.string()),
    body: v.string(),
    eventId: v.string(),
    origin: v.string(),
    roomId: v.string(),
    sentAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_room", ["roomId"]),
});

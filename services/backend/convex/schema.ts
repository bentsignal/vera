import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  inviteCodes: defineTable({
    active: v.boolean(),
    code: v.string(),
    deactivatedAt: v.optional(v.number()),
    label: v.optional(v.string()),
    /** Set when the code signs up only this username. */
    username: v.optional(v.string()),
  }).index("by_code", ["code"]),
  inviteRedemptions: defineTable({
    accountId: v.string(),
    code: v.string(),
  }).index("by_code", ["code"]),
});

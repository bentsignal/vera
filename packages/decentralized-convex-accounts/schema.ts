import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  profiles: defineTable({
    accountId: v.string(),
    avatarUrl: v.union(v.null(), v.string()),
    displayName: v.string(),
  }).index("by_account", ["accountId"]),
});

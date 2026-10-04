import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  /** Accounts the PDS operator vouches for as speaking for the PDS. */
  affiliations: defineTable({
    accountId: v.string(),
  }).index("by_account", ["accountId"]),
  profiles: defineTable({
    accountId: v.string(),
    avatarUrl: v.union(v.null(), v.string()),
    displayName: v.string(),
  }).index("by_account", ["accountId"]),
});

import { v } from "convex/values";

import type { QueryCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";

/**
 * Affiliated accounts belong to the PDS itself, such as its support
 * account, and apps mark them with a badge. Only the PDS operator sets
 * them: Component functions are callable by the host PDS, never by
 * clients. The host checks that the account is its own.
 */
export const setAffiliated = mutation({
  args: { accountId: v.string(), affiliated: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const accountId = args.accountId.trim().toLowerCase();
    const existing = await findAffiliation(ctx, accountId);
    if (args.affiliated && existing === null) {
      await ctx.db.insert("affiliations", { accountId });
    } else if (!args.affiliated && existing !== null) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

/**
 * Deletes an account's profile and affiliation, for a host retiring one of
 * its own accounts (Vera folding its support account into its assistant).
 * The host deletes the account itself.
 */
export const removeAccount = mutation({
  args: { accountId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const accountId = args.accountId.trim().toLowerCase();
    const affiliation = await findAffiliation(ctx, accountId);
    if (affiliation !== null) await ctx.db.delete(affiliation._id);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_account", (index) => index.eq("accountId", accountId))
      .unique();
    if (profile !== null) await ctx.db.delete(profile._id);
    return null;
  },
});

export const listAffiliated = query({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const rows = await ctx.db.query("affiliations").collect();
    return rows.map((row) => row.accountId).sort();
  },
});

export async function isAffiliated(ctx: QueryCtx, accountId: string) {
  return (await findAffiliation(ctx, accountId)) !== null;
}

function findAffiliation(ctx: QueryCtx, accountId: string) {
  return ctx.db
    .query("affiliations")
    .withIndex("by_account", (index) => index.eq("accountId", accountId))
    .unique();
}

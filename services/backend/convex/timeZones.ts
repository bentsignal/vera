import { ConvexError, v } from "convex/values";

import { internalQuery, mutation } from "./_generated/server";

// The time zone of each person's device, which the app sends with messages
// to Vera's assistants so they know what time and day it is for them.

/** Called by the app after it sends a message to an assistant. */
export const report = mutation({
  args: { timeZone: v.string() },
  handler: async (ctx, { timeZone }) => {
    const identity = await ctx.auth.getUserIdentity();
    const accountId =
      typeof identity?.accountId === "string" ? identity.accountId : null;
    if (accountId === null) {
      throw new ConvexError({ code: "AUTHENTICATED_ACCOUNT_REQUIRED" });
    }
    if (!isTimeZone(timeZone)) return;
    const existing = await ctx.db
      .query("timeZones")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .unique();
    if (existing === null) {
      await ctx.db.insert("timeZones", { accountId, timeZone });
    } else if (existing.timeZone !== timeZone) {
      await ctx.db.patch(existing._id, { timeZone });
    }
  },
});

export const of = internalQuery({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }) => {
    const row = await ctx.db
      .query("timeZones")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .unique();
    return row?.timeZone ?? null;
  },
});

function isTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** "Monday, October 19, 2026, 8:15 AM (America/Chicago)", or UTC. */
export function localTime(timeZone: string | null) {
  const zone = timeZone ?? "UTC";
  const when = new Date().toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: zone,
  });
  return `${when} (${zone})`;
}

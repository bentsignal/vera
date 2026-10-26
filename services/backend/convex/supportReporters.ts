import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation } from "./_generated/server";

// What Vera Support knows about the people who write to it: the app version
// and device their app reports, whether they want technical details, and
// whether they've been told reports are public.

/**
 * Called by the app after it sends a message to support: the app version
 * and device, for the bug reports support files. Old apps never call it.
 */
export const reportClient = mutation({
  args: {
    appVersion: v.string(),
    channel: v.string(),
    device: v.string(),
    os: v.string(),
    update: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const accountId =
      typeof identity?.accountId === "string" ? identity.accountId : null;
    if (accountId === null) {
      throw new ConvexError({ code: "AUTHENTICATED_ACCOUNT_REQUIRED" });
    }
    const info = {
      accountId,
      appVersion: args.appVersion.slice(0, 64),
      channel: args.channel.slice(0, 64),
      device: args.device.slice(0, 64),
      os: args.os.slice(0, 64),
      reportedAt: Date.now(),
      update: args.update.slice(0, 64),
    };
    const existing = await ctx.db
      .query("clientInfo")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .unique();
    if (existing === null) await ctx.db.insert("clientInfo", info);
    else await ctx.db.replace(existing._id, info);
  },
});

/** What support knows about a reporter. */
export const reporter = internalQuery({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }): Promise<Reporter> => {
    const row = await ctx.db
      .query("supportReporters")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .unique();
    const client = await ctx.db
      .query("clientInfo")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .unique();
    return {
      client: client && clientDetails(client),
      developer: row?.developer ?? null,
      noticeSharedAt: row?.noticeSharedAt ?? null,
    };
  },
});

export const updateReporter = internalMutation({
  args: {
    accountId: v.string(),
    developer: v.optional(v.boolean()),
    noticeShared: v.optional(v.boolean()),
  },
  handler: async (ctx, { accountId, developer, noticeShared }) => {
    const changes = {
      ...(developer !== undefined && { developer }),
      ...(noticeShared === true && { noticeSharedAt: Date.now() }),
    };
    const row = await ctx.db
      .query("supportReporters")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .unique();
    if (row === null) {
      await ctx.db.insert("supportReporters", { accountId, ...changes });
    } else {
      await ctx.db.patch(row._id, changes);
    }
  },
});

/** What support knows about a reporter (`reporter`). */
export interface Reporter {
  readonly client: {
    appVersion: string;
    channel: string;
    device: string;
    os: string;
    update: string;
  } | null;
  readonly developer: boolean | null;
  /** When support last told them reports are public. */
  readonly noticeSharedAt: number | null;
}

function clientDetails(client: Doc<"clientInfo">) {
  const { appVersion, channel, device, os, update } = client;
  return { appVersion, channel, device, os, update };
}

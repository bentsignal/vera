import { v } from "convex/values";

import type { MutationCtx } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { internalMutation } from "./_generated/server.js";
import {
  conversationActivity,
  getConversationRow,
  sectionOf,
  upsertEntry,
} from "./inboxEntries.ts";

// Who has rows in inboxes (`inboxEntries`): a new channel, joining and
// leaving a space, a channel deleted. Each is a job, a batch at a time,
// since spaces have no limit on channels or members.

/** Rows a new channel adds per run. */
const CHANNEL_BATCH = 200;
/** Channels a join adds rows for per run. */
export const JOIN_BATCH = 100;
/** Rows deleted per run when a channel goes or someone leaves a space. */
const DELETE_BATCH = 500;

/** Lists a new channel in its space's members' inboxes. */
export async function scheduleChannelEntries(
  ctx: MutationCtx,
  conversationId: string,
) {
  await ctx.scheduler.runAfter(0, internal.inboxMembers.addChannel, {
    conversationId,
  });
}

/** One batch of a new channel's rows, by member address after `after`. */
export async function addChannelBatch(
  ctx: MutationCtx,
  conversationId: string,
  after: string | undefined,
) {
  const channel = await getConversationRow(ctx, conversationId);
  const { spaceId } = channel ?? {};
  if (channel?.kind !== "channel" || spaceId === undefined) return;
  const members = await ctx.db
    .query("spaceMembers")
    .withIndex("by_space_account", (index) => {
      const scoped = index.eq("spaceId", spaceId);
      return after === undefined ? scoped : scoped.gt("accountId", after);
    })
    .take(CHANNEL_BATCH + 1);
  const activityAt = await conversationActivity(ctx, channel);
  const batch = members.slice(0, CHANNEL_BATCH);
  for (const { accountId } of batch) {
    await upsertEntry(ctx, accountId, channel, { activityAt });
  }
  const last = batch.at(-1);
  if (members.length > CHANNEL_BATCH && last !== undefined) {
    await ctx.scheduler.runAfter(0, internal.inboxMembers.addChannel, {
      after: last.accountId,
      conversationId,
    });
  }
}

export const addChannel = internalMutation({
  args: { after: v.optional(v.string()), conversationId: v.string() },
  handler: async (ctx, { after, conversationId }) => {
    await addChannelBatch(ctx, conversationId, after);
    return null;
  },
});

/** Lists a space's channels in a new member's inbox. */
export async function scheduleJoin(
  ctx: MutationCtx,
  spaceId: string,
  accountId: string,
) {
  await ctx.scheduler.runAfter(0, internal.inboxMembers.join, {
    accountId,
    spaceId,
  });
}

/**
 * One batch of a member's rows for a space's channels, by channel after
 * `after` (its `_creationTime`). Stops if they've left since. Returns
 * where the next batch starts, if there is one.
 */
export async function joinBatch(
  ctx: MutationCtx,
  spaceId: string,
  accountId: string,
  after: number | undefined,
) {
  const member = await ctx.db
    .query("spaceMembers")
    .withIndex("by_space_account", (index) =>
      index.eq("spaceId", spaceId).eq("accountId", accountId),
    )
    .unique();
  if (member === null) return undefined;
  const channels = await ctx.db
    .query("conversations")
    .withIndex("by_space", (index) => {
      const scoped = index.eq("spaceId", spaceId);
      return after === undefined ? scoped : scoped.gt("_creationTime", after);
    })
    .take(JOIN_BATCH + 1);
  const batch = channels.slice(0, JOIN_BATCH);
  for (const channel of batch) {
    // Choices made before leaving and joining again still stand.
    const [activityAt, own] = await Promise.all([
      conversationActivity(ctx, channel),
      ctx.db
        .query("members")
        .withIndex("by_conversation_account", (index) =>
          index
            .eq("conversationId", channel.conversationId)
            .eq("accountId", accountId),
        )
        .unique(),
    ]);
    await upsertEntry(ctx, accountId, channel, {
      activityAt,
      pinnedAt: own?.pinnedAt ?? null,
      section: sectionOf(channel, own),
    });
  }
  const last = batch.at(-1);
  return channels.length > JOIN_BATCH ? last?._creationTime : undefined;
}

export const join = internalMutation({
  args: {
    accountId: v.string(),
    after: v.optional(v.number()),
    spaceId: v.string(),
  },
  handler: async (ctx, { accountId, after, spaceId }) => {
    const next = await joinBatch(ctx, spaceId, accountId, after);
    if (next !== undefined) {
      await ctx.scheduler.runAfter(0, internal.inboxMembers.join, {
        accountId,
        after: next,
        spaceId,
      });
    }
    return null;
  },
});

/** Takes a space's channels out of a former member's inbox. */
export async function scheduleLeave(
  ctx: MutationCtx,
  spaceId: string,
  accountId: string,
) {
  await ctx.scheduler.runAfter(0, internal.inboxMembers.leave, {
    accountId,
    spaceId,
  });
}

/** One batch of `scheduleLeave`; whether there's more. */
export async function leaveBatch(
  ctx: MutationCtx,
  spaceId: string,
  accountId: string,
) {
  // Back in the space since: their rows stay.
  const member = await ctx.db
    .query("spaceMembers")
    .withIndex("by_space_account", (index) =>
      index.eq("spaceId", spaceId).eq("accountId", accountId),
    )
    .unique();
  if (member !== null) return false;
  const rows = await ctx.db
    .query("inboxEntries")
    .withIndex("by_account_space", (index) =>
      index.eq("accountId", accountId).eq("spaceId", spaceId),
    )
    .take(DELETE_BATCH);
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length === DELETE_BATCH;
}

export const leave = internalMutation({
  args: { accountId: v.string(), spaceId: v.string() },
  handler: async (ctx, { accountId, spaceId }) => {
    if (await leaveBatch(ctx, spaceId, accountId)) {
      await ctx.scheduler.runAfter(0, internal.inboxMembers.leave, {
        accountId,
        spaceId,
      });
    }
    return null;
  },
});

/** Takes a deleted conversation out of every inbox. */
export async function scheduleForget(ctx: MutationCtx, conversationId: string) {
  await ctx.scheduler.runAfter(0, internal.inboxMembers.forget, {
    conversationId,
  });
}

/** One batch of `scheduleForget`; whether there's more. */
export async function forgetBatch(ctx: MutationCtx, conversationId: string) {
  const rows = await ctx.db
    .query("inboxEntries")
    .withIndex("by_conversation", (index) =>
      index.eq("conversationId", conversationId),
    )
    .take(DELETE_BATCH);
  for (const row of rows) await ctx.db.delete(row._id);
  if (rows.length === DELETE_BATCH) return true;
  const state = await ctx.db
    .query("inboxBumps")
    .withIndex("by_conversation", (index) =>
      index.eq("conversationId", conversationId),
    )
    .unique();
  if (state !== null) await ctx.db.delete(state._id);
  return false;
}

export const forget = internalMutation({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }) => {
    if (await forgetBatch(ctx, conversationId)) {
      await ctx.scheduler.runAfter(0, internal.inboxMembers.forget, {
        conversationId,
      });
    }
    return null;
  },
});

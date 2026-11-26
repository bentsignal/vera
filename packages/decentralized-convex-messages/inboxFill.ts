import { v } from "convex/values";

import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { internalMutation } from "./_generated/server.js";
import {
  conversationActivity,
  getConversationRow,
  upsertEntry,
} from "./inboxEntries.ts";
import { joinBatch } from "./inboxMembers.ts";

/** Memberships `fill` looks at per run. */
const FILL_BATCH = 100;
/** The `sequencing` row that says `fill` has run. */
const FILL_KEY = "inboxFill";

// Rows for what existed before them, filled in once after the deploy that
// adds them. Until that's done, inboxes are listed as before (see
// `isFilled`).

function fillState(ctx: QueryCtx) {
  return ctx.db
    .query("sequencing")
    .withIndex("by_key", (index) => index.eq("key", FILL_KEY))
    .unique();
}

/** Whether every inbox has its rows, so they can be read a page at a time. */
export async function isFilled(ctx: QueryCtx) {
  return (await fillState(ctx))?.done === true;
}

/**
 * Starts filling in rows for what existed before them, once. Called by
 * the first message after the deploy (its `bump`), so it needs no
 * command.
 */
export async function startFill(ctx: MutationCtx) {
  if ((await fillState(ctx)) !== null) return;
  await ctx.db.insert("sequencing", { done: false, key: FILL_KEY });
  await ctx.scheduler.runAfter(0, internal.inboxFill.fill, {
    phase: "members",
  });
}

/**
 * One batch of the fill: direct and group memberships first, then space
 * memberships (each joining its space's channels, the first batch here
 * and the rest as a job). Returns where the next batch starts, or null
 * when it's done.
 */
export async function fillBatch(
  ctx: MutationCtx,
  phase: "members" | "spaces",
  cursor: string | null,
): Promise<null | { cursor: string | null; phase: "members" | "spaces" }> {
  if (phase === "members") {
    const page = await fillMembers(ctx, cursor);
    return page.isDone
      ? { cursor: null, phase: "spaces" }
      : { cursor: page.continueCursor, phase };
  }
  const page = await fillSpaces(ctx, cursor);
  if (!page.isDone) return { cursor: page.continueCursor, phase };
  const state = await fillState(ctx);
  if (state === null) {
    await ctx.db.insert("sequencing", { done: true, key: FILL_KEY });
  } else {
    await ctx.db.patch(state._id, { done: true });
  }
  return null;
}

/** Rows for a batch of direct and group memberships. */
async function fillMembers(ctx: MutationCtx, cursor: string | null) {
  const page = await ctx.db
    .query("members")
    .paginate({ cursor, numItems: FILL_BATCH });
  for (const member of page.page) {
    const conversation = await getConversationRow(ctx, member.conversationId);
    // A channel's come from its space (`fillSpaces`).
    if (conversation === null || conversation.kind === "channel") continue;
    await upsertEntry(ctx, member.accountId, conversation, {
      activityAt: await conversationActivity(ctx, conversation),
      pinnedAt: member.pinnedAt ?? null,
    });
  }
  return page;
}

/**
 * Rows for a batch of space memberships: the first batch of each space's
 * channels here, the rest as a job.
 */
async function fillSpaces(ctx: MutationCtx, cursor: string | null) {
  const page = await ctx.db
    .query("spaceMembers")
    .paginate({ cursor, numItems: FILL_BATCH / 10 });
  for (const { accountId, spaceId } of page.page) {
    const next = await joinBatch(ctx, spaceId, accountId, undefined);
    if (next !== undefined) {
      await ctx.scheduler.runAfter(0, internal.inboxMembers.join, {
        accountId,
        after: next,
        spaceId,
      });
    }
  }
  return page;
}

export const fill = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    phase: v.union(v.literal("members"), v.literal("spaces")),
  },
  handler: async (ctx, { cursor, phase }) => {
    const next = await fillBatch(ctx, phase, cursor ?? null);
    if (next !== null) {
      await ctx.scheduler.runAfter(0, internal.inboxFill.fill, {
        phase: next.phase,
        ...(next.cursor === null ? {} : { cursor: next.cursor }),
      });
    }
    return null;
  },
});

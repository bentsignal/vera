import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { internalMutation } from "./_generated/server.js";
import { conversationActivity, getConversationRow } from "./inboxEntries.ts";
import { startFill } from "./inboxFill.ts";

// Moving a conversation up its members' inboxes (`inboxEntries`).
//
// A send writes nothing there: two sends to one conversation would
// conflict, and a channel would write a row for everyone in its space.
// Each message schedules `bump`, which moves the conversation up its
// rows a moment later, a batch at a time.

/** How long after a message its conversation moves up. */
const BUMP_DELAY_MS = 1_000;
/** Rows a bump raises per run; a longer list continues in the next. */
export const BUMP_BATCH = 200;
/**
 * How long a conversation too big for one run waits before moving up
 * again during a burst of messages, so a busy channel in a big space
 * writes its rows at most this often.
 */
export const BIG_BUMP_COOLDOWN_MS = 30_000;

/** Moves the conversation up its rows shortly (each message calls it). */
export async function scheduleBump(ctx: MutationCtx, conversationId: string) {
  await ctx.scheduler.runAfter(BUMP_DELAY_MS, internal.inboxOrder.bump, {
    conversationId,
  });
}

function bumpState(ctx: QueryCtx, conversationId: string) {
  return ctx.db
    .query("inboxBumps")
    .withIndex("by_conversation", (index) =>
      index.eq("conversationId", conversationId),
    )
    .unique();
}

/**
 * Starts moving the conversation up its rows to its latest activity,
 * unless they're there already or a pass is under way (which looks again
 * when it finishes).
 */
export async function bumpConversation(
  ctx: MutationCtx,
  conversationId: string,
) {
  const conversation = await getConversationRow(ctx, conversationId);
  if (conversation === null) return;
  const [activity, state] = await Promise.all([
    conversationActivity(ctx, conversation),
    bumpState(ctx, conversationId),
  ]);
  if (state?.target !== undefined) return;
  if (state !== null && state.through >= activity) return;
  const id =
    state?._id ??
    (await ctx.db.insert("inboxBumps", { conversationId, through: 0 }));
  await bumpBatch(ctx, id, conversation, activity, undefined);
}

/** Continues a pass where the last run left off. */
export async function continueBump(ctx: MutationCtx, conversationId: string) {
  const state = await bumpState(ctx, conversationId);
  const conversation = await getConversationRow(ctx, conversationId);
  if (state?.target === undefined) return;
  if (conversation === null) {
    await ctx.db.delete(state._id);
    return;
  }
  await bumpBatch(ctx, state._id, conversation, state.target, state.cursor);
}

/**
 * Raises one batch of the conversation's rows to `target`. The last
 * batch looks again: messages sent during the pass start another, at
 * once for a conversation that fit in one run, after
 * `BIG_BUMP_COOLDOWN_MS` for one that didn't.
 */
async function bumpBatch(
  ctx: MutationCtx,
  stateId: Doc<"inboxBumps">["_id"],
  conversation: Doc<"conversations">,
  target: number,
  cursor: number | undefined,
) {
  const { conversationId } = conversation;
  const rows = await ctx.db
    .query("inboxEntries")
    .withIndex("by_conversation", (index) => {
      const scoped = index.eq("conversationId", conversationId);
      return cursor === undefined ? scoped : scoped.gt("_creationTime", cursor);
    })
    .take(BUMP_BATCH + 1);
  const batch = rows.slice(0, BUMP_BATCH);
  for (const row of batch) {
    if (row.activityAt < target) {
      await ctx.db.patch(row._id, { activityAt: target });
    }
  }
  const last = batch.at(-1);
  if (rows.length > BUMP_BATCH && last !== undefined) {
    await ctx.db.patch(stateId, { cursor: last._creationTime, target });
    await ctx.scheduler.runAfter(0, internal.inboxOrder.bumpMore, {
      conversationId,
    });
    return;
  }
  await ctx.db.patch(stateId, {
    cursor: undefined,
    target: undefined,
    through: target,
  });
  if ((await conversationActivity(ctx, conversation)) > target) {
    await ctx.scheduler.runAfter(
      cursor === undefined ? 0 : BIG_BUMP_COOLDOWN_MS,
      internal.inboxOrder.bump,
      { conversationId },
    );
  }
}

export const bump = internalMutation({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }) => {
    await bumpConversation(ctx, conversationId);
    await startFill(ctx);
    return null;
  },
});

export const bumpMore = internalMutation({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }) => {
    await continueBump(ctx, conversationId);
    return null;
  },
});

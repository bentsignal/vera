import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { internalMutation } from "./_generated/server.js";

// Counting unread messages without reading them. Each message a
// conversation shows gets a number, 1, 2, 3…, in the order they were sent
// (`chatSequence`), so how many came after the reader's place is the
// newest number less the number there, less the ones deleted since, plus
// the few too new to be numbered yet.
//
// Numbers are given out after the fact, in batches, not by `send`: a send
// that read the newest number would conflict with every other send to the
// conversation, and a number written onto the message would rerun every
// page showing it. A conversation's newest messages wait to be numbered
// until it goes quiet or a minute has passed, so a busy conversation
// reruns what counts it about once a minute, not once a message.

/** How long after a message is sent its conversation is looked at. */
const SEQUENCE_AFTER_MS = 30_000;
/** Messages waiting longer than this are numbered, even mid-stream. */
const MAX_WAIT_MS = 60_000;
/**
 * Messages younger than this aren't numbered yet: a send that started
 * before them may still commit with an earlier `sentAt`.
 */
const SETTLE_MS = 5_000;
/** Messages numbered per run; a longer backlog continues in the next. */
const BATCH = 200;
/** Not-yet-numbered messages a count reads before it stops. */
const MAX_TAIL = 200;
/** Deleted messages a count reads before it stops. */
const MAX_DELETED = 1_000;
/** Conversations a backfill run schedules before continuing. */
const BACKFILL_BATCH = 100;

/** The newest numbered message of a conversation. */
function newestNumbered(ctx: QueryCtx, conversationId: string) {
  return ctx.db
    .query("chatSequence")
    .withIndex("by_conversation_seq", (index) =>
      index.eq("conversationId", conversationId),
    )
    .order("desc")
    .first();
}

/** The conversation's messages (not those kept in threads) sent after `after`. */
function shownAfter(ctx: QueryCtx, conversationId: string, after: number) {
  return ctx.db
    .query("messages")
    .withIndex("by_chat_sent", (index) =>
      index
        .eq("conversationId", conversationId)
        .eq("threadOnly", undefined)
        .gt("sentAt", after),
    );
}

/** Looks at the conversation once its newest message has settled. */
export async function scheduleNumbering(
  ctx: MutationCtx,
  conversationId: string,
  after = SEQUENCE_AFTER_MS,
) {
  await ctx.scheduler.runAfter(after, internal.sequences.number, {
    conversationId,
  });
}

/** Where numbering left off: the newest number, and its message's time. */
function numberedThrough(newest: Doc<"chatSequence"> | null) {
  return newest === null
    ? { after: 0, last: 0 }
    : { after: newest.sentAt, last: newest.seq };
}

/** Numbers `messages`, oldest first, after the number `last`. */
async function numberInOrder(
  ctx: MutationCtx,
  messages: readonly Doc<"messages">[],
  last: number,
) {
  for (const [index, message] of messages.entries()) {
    await ctx.db.insert("chatSequence", {
      conversationId: message.conversationId,
      ...(message.deletedAt === undefined ? {} : { deleted: true }),
      messageId: message.messageId,
      sentAt: message.sentAt,
      seq: last + index + 1,
    });
  }
}

/**
 * Whether the messages waiting to be numbered should be now: no later
 * look is coming (this one was scheduled by the newest), or the oldest
 * has waited `MAX_WAIT_MS`.
 */
async function timeToNumber(
  ctx: QueryCtx,
  conversationId: string,
  after: number,
  now: number,
) {
  const [first, last] = await Promise.all([
    shownAfter(ctx, conversationId, after).order("asc").first(),
    shownAfter(ctx, conversationId, after).order("desc").first(),
  ]);
  if (first === null || last === null) return false;
  const laterLook = last.sentAt + SEQUENCE_AFTER_MS > now + 1_000;
  return !laterLook || first.sentAt <= now - MAX_WAIT_MS;
}

/**
 * Numbers the conversation's settled messages, if it's time: when no
 * later look is coming (this was scheduled by its newest message), when
 * the oldest has waited `MAX_WAIT_MS`, or when `force`d (a backlog).
 * Deciding reads two messages, so a look that waits costs next to
 * nothing.
 */
export async function numberMessages(
  ctx: MutationCtx,
  conversationId: string,
  { force = false, now = Date.now() } = {},
) {
  const { after, last } = numberedThrough(
    await newestNumbered(ctx, conversationId),
  );
  if (!force && !(await timeToNumber(ctx, conversationId, after, now))) {
    return;
  }
  const waiting = await shownAfter(ctx, conversationId, after)
    .order("asc")
    .take(BATCH + 1);
  const settled = waiting.filter(({ sentAt }) => sentAt <= now - SETTLE_MS);
  await numberInOrder(ctx, settled.slice(0, BATCH), last);
  // A backlog (a conversation from before numbering) continues.
  if (waiting.length > BATCH) {
    await ctx.scheduler.runAfter(0, internal.sequences.number, {
      conversationId,
      force: true,
    });
  }
}

export const number = internalMutation({
  args: { conversationId: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, { conversationId, force }) => {
    await numberMessages(ctx, conversationId, { force: force === true });
    await startBackfill(ctx);
    return null;
  },
});

/**
 * Numbers a conversation from before numbering as soon as someone reads
 * it, rather than waiting for the backfill.
 */
export async function numberIfUnnumbered(
  ctx: MutationCtx,
  conversationId: string,
) {
  if ((await newestNumbered(ctx, conversationId)) === null) {
    await scheduleNumbering(ctx, conversationId, 0);
  }
}

/**
 * A deleted message no longer counts as unread: its number is marked,
 * once it has one. (One deleted before it's numbered is never numbered,
 * or, kept for its thread, numbered as deleted.)
 */
export async function markNumberDeleted(ctx: MutationCtx, messageId: string) {
  const row = await ctx.db
    .query("chatSequence")
    .withIndex("by_message", (index) => index.eq("messageId", messageId))
    .unique();
  if (row !== null && row.deleted !== true) {
    await ctx.db.patch(row._id, { deleted: true });
  }
}

/**
 * How many messages others sent after `readAt` (deleted ones aside), from
 * the numbers; undefined until the conversation is numbered. A send moves
 * its author's place to it, so none of the reader's own numbered messages
 * are after their place.
 */
export async function numberedUnread(
  ctx: QueryCtx,
  conversationId: string,
  accountId: string,
  readAt: number,
) {
  const newest = await newestNumbered(ctx, conversationId);
  if (newest === null) return undefined;
  const atRead =
    readAt >= newest.sentAt
      ? newest
      : await ctx.db
          .query("chatSequence")
          .withIndex("by_conversation_sent", (index) =>
            index.eq("conversationId", conversationId).lte("sentAt", readAt),
          )
          .order("desc")
          .first();
  const readSeq = atRead?.seq ?? 0;
  const deleted =
    readSeq >= newest.seq
      ? []
      : await ctx.db
          .query("chatSequence")
          .withIndex("by_conversation_deleted_seq", (index) =>
            index
              .eq("conversationId", conversationId)
              .eq("deleted", true)
              .gt("seq", readSeq),
          )
          .take(MAX_DELETED);
  const tail = await shownAfter(
    ctx,
    conversationId,
    Math.max(newest.sentAt, readAt),
  ).take(MAX_TAIL);
  const unnumbered = tail.filter(
    ({ authorId, deletedAt }) =>
      authorId !== accountId && deletedAt === undefined,
  ).length;
  return Math.max(0, newest.seq - readSeq - deleted.length) + unnumbered;
}

/**
 * Numbers every conversation once, for those from before numbering that
 * nobody sends to or reads (`backfill` state). Started by the first
 * numbering run after this deploys; a run at a time, `BACKFILL_BATCH`
 * conversations each.
 */
async function startBackfill(ctx: MutationCtx) {
  const state = await ctx.db
    .query("sequencing")
    .withIndex("by_key", (index) => index.eq("key", "backfill"))
    .unique();
  if (state !== null) return;
  await ctx.db.insert("sequencing", { done: false, key: "backfill" });
  await ctx.scheduler.runAfter(0, internal.sequences.backfill, {});
}

export const backfill = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("conversations")
      .paginate({ cursor: cursor ?? null, numItems: BACKFILL_BATCH });
    for (const [index, { conversationId }] of page.page.entries()) {
      // Spread out, so the backlog doesn't land at once.
      await ctx.scheduler.runAfter(index * 200, internal.sequences.number, {
        conversationId,
        force: true,
      });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        BACKFILL_BATCH * 200,
        internal.sequences.backfill,
        { cursor: page.continueCursor },
      );
      return null;
    }
    const state = await ctx.db
      .query("sequencing")
      .withIndex("by_key", (index) => index.eq("key", "backfill"))
      .unique();
    if (state !== null) await ctx.db.patch(state._id, { done: true });
    return null;
  },
});

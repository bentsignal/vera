import type { Doc } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
import { numberedUnread } from "./sequences.ts";

// What a conversation itself shows: every message but the replies kept in
// their threads.

const MAX_UNREAD = 99;

/** Deleted originals kept for their threads that an inbox looks past. */
const MAX_DELETED_SKIPPED = 10;

/**
 * The newest message the conversation shows (`shown`: not one kept in a
 * thread, nor a deleted original kept for its thread), and when its newest
 * message was sent, deleted or not.
 */
export async function latestMessage(ctx: QueryCtx, conversationId: string) {
  function newestFirst() {
    return ctx.db
      .query("messages")
      .withIndex("by_chat_sent", (index) =>
        index.eq("conversationId", conversationId).eq("threadOnly", undefined),
      )
      .order("desc");
  }
  // Almost always the newest itself, so it reads one message; only past a
  // deleted original does it read more.
  const first = await newestFirst().first();
  const newest =
    first?.deletedAt === undefined
      ? [first]
      : await newestFirst().take(MAX_DELETED_SKIPPED + 1);
  return {
    newestSentAt: newest[0]?.sentAt,
    shown: newest.find((message) => message?.deletedAt === undefined) ?? null,
  };
}

/** Messages a has-unread check looks at before counting them all. */
const UNREAD_PEEK = 5;

/**
 * Whether the account has anything unread in the conversation: what
 * `unreadCount` counts, stopping at the first one (almost always among
 * the first few after `lastReadAt`).
 */
export async function hasUnread(
  ctx: QueryCtx,
  conversationId: string,
  accountId: string,
  lastReadAt: number,
) {
  const first = await ctx.db
    .query("messages")
    .withIndex("by_chat_sent", (index) =>
      index
        .eq("conversationId", conversationId)
        .eq("threadOnly", undefined)
        .gt("sentAt", lastReadAt),
    )
    .take(UNREAD_PEEK);
  if (first.some((message) => countsAsUnread(message, accountId))) {
    return true;
  }
  if (first.length < UNREAD_PEEK) return false;
  return (await unreadCount(ctx, conversationId, accountId, lastReadAt)) > 0;
}

function countsAsUnread(message: Doc<"messages">, accountId: string) {
  return message.authorId !== accountId && message.deletedAt === undefined;
}

/**
 * How many messages others sent after `lastReadAt` that still show: from
 * the conversation's numbers (see sequences.ts), or until it's numbered,
 * read one by one, at most `MAX_UNREAD`.
 */
export async function unreadCount(
  ctx: QueryCtx,
  conversationId: string,
  accountId: string,
  lastReadAt: number,
) {
  return (
    (await numberedUnread(ctx, conversationId, accountId, lastReadAt)) ??
    scannedUnread(ctx, conversationId, accountId, lastReadAt)
  );
}

async function scannedUnread(
  ctx: QueryCtx,
  conversationId: string,
  accountId: string,
  lastReadAt: number,
) {
  const unread = await ctx.db
    .query("messages")
    .withIndex("by_chat_sent", (index) =>
      index
        .eq("conversationId", conversationId)
        .eq("threadOnly", undefined)
        .gt("sentAt", lastReadAt),
    )
    .take(MAX_UNREAD + 1);
  return unread.filter((message) => countsAsUnread(message, accountId)).length;
}

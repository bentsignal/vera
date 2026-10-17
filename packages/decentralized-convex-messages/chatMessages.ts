import type { QueryCtx } from "./_generated/server.js";

// What a conversation itself shows: every message but the replies kept in
// their threads.

const MAX_UNREAD = 99;

/** Deleted originals kept for their threads that an inbox looks past. */
const MAX_DELETED_SKIPPED = 10;

/**
 * The newest message the conversation shows (not one kept in a thread,
 * nor a deleted original kept for its thread).
 */
export async function latestMessage(ctx: QueryCtx, conversationId: string) {
  const newest = await ctx.db
    .query("messages")
    .withIndex("by_chat_sent", (index) =>
      index.eq("conversationId", conversationId).eq("threadOnly", undefined),
    )
    .order("desc")
    .take(MAX_DELETED_SKIPPED + 1);
  return newest.find((message) => message.deletedAt === undefined) ?? null;
}

export async function unreadCount(
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
  return unread.filter(
    (message) =>
      message.authorId !== accountId && message.deletedAt === undefined,
  ).length;
}

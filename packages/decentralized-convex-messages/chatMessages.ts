import type { QueryCtx } from "./_generated/server.js";

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

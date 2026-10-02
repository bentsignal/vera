import type { Doc } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
import { MESSAGE_PAGE_SIZE } from "./protocol.ts";

/** Message pages are oldest first, for lists that open at the bottom. */
export interface MessagePage {
  readonly hasNewer: boolean;
  readonly hasOlder: boolean;
  readonly messages: Doc<"messages">[];
}

export async function olderThan(
  ctx: QueryCtx,
  conversationId: string,
  before: number | undefined,
  limit = MESSAGE_PAGE_SIZE,
) {
  const rows = await ctx.db
    .query("messages")
    .withIndex("by_conversation_sent", (index) =>
      before === undefined
        ? index.eq("conversationId", conversationId)
        : index.eq("conversationId", conversationId).lt("sentAt", before),
    )
    .order("desc")
    .take(limit + 1);
  return {
    hasMore: rows.length > limit,
    messages: rows.slice(0, limit).reverse(),
  };
}

export async function newerThan(
  ctx: QueryCtx,
  conversationId: string,
  after: number,
  inclusive = false,
  limit = MESSAGE_PAGE_SIZE,
) {
  const rows = await ctx.db
    .query("messages")
    .withIndex("by_conversation_sent", (index) =>
      inclusive
        ? index.eq("conversationId", conversationId).gte("sentAt", after)
        : index.eq("conversationId", conversationId).gt("sentAt", after),
    )
    .order("asc")
    .take(limit + 1);
  return { hasMore: rows.length > limit, messages: rows.slice(0, limit) };
}

/** Half a page on each side of one message, so it can open centered. */
export async function around(
  ctx: QueryCtx,
  conversationId: string,
  messageId: string,
): Promise<MessagePage | null> {
  const anchor = await ctx.db
    .query("messages")
    .withIndex("by_message", (index) => index.eq("messageId", messageId))
    .unique();
  if (anchor?.conversationId !== conversationId) return null;
  const half = Math.floor(MESSAGE_PAGE_SIZE / 2);
  const older = await olderThan(ctx, conversationId, anchor.sentAt, half);
  const newer = await newerThan(ctx, conversationId, anchor.sentAt, true, half);
  return {
    hasNewer: newer.hasMore,
    hasOlder: older.hasMore,
    messages: [...older.messages, ...newer.messages],
  };
}

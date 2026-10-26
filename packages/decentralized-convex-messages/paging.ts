import type { Doc } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
import { MESSAGE_PAGE_SIZE } from "./protocol.ts";

/** Message pages are oldest first, for lists that open at the bottom. */
export interface MessagePage {
  readonly hasNewer: boolean;
  readonly hasOlder: boolean;
  readonly messages: Doc<"messages">[];
}

/**
 * What a page lists: a conversation as it shows (without the replies that
 * stay in their threads), or one thread's replies.
 */
export type Scope =
  | { readonly conversationId: string }
  | { readonly threadId: string };

/** Where a page starts, by `sentAt`. */
type Bound =
  | { readonly gt: number }
  | { readonly gte: number }
  | { readonly lt: number }
  | undefined;

function scoped(ctx: QueryCtx, scope: Scope, bound: Bound) {
  const messages = ctx.db.query("messages");
  if ("threadId" in scope) {
    return messages.withIndex("by_thread_sent", (index) => {
      const thread = index.eq("threadId", scope.threadId);
      if (bound === undefined) return thread;
      if ("lt" in bound) return thread.lt("sentAt", bound.lt);
      if ("gt" in bound) return thread.gt("sentAt", bound.gt);
      return thread.gte("sentAt", bound.gte);
    });
  }
  return messages.withIndex("by_chat_sent", (index) => {
    const chat = index
      .eq("conversationId", scope.conversationId)
      .eq("threadOnly", undefined);
    if (bound === undefined) return chat;
    if ("lt" in bound) return chat.lt("sentAt", bound.lt);
    if ("gt" in bound) return chat.gt("sentAt", bound.gt);
    return chat.gte("sentAt", bound.gte);
  });
}

export async function olderThan(
  ctx: QueryCtx,
  scope: Scope,
  before: number | undefined,
  limit = MESSAGE_PAGE_SIZE,
) {
  const rows = await scoped(
    ctx,
    scope,
    before === undefined ? undefined : { lt: before },
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
  scope: Scope,
  after: number,
  inclusive = false,
  limit = MESSAGE_PAGE_SIZE,
) {
  const rows = await scoped(
    ctx,
    scope,
    inclusive ? { gte: after } : { gt: after },
  )
    .order("asc")
    .take(limit + 1);
  return { hasMore: rows.length > limit, messages: rows.slice(0, limit) };
}

function messageById(ctx: QueryCtx, messageId: string) {
  return ctx.db
    .query("messages")
    .withIndex("by_message", (index) => index.eq("messageId", messageId))
    .unique();
}

/**
 * Where a conversation opens at a message: the message, or for a reply
 * kept in its thread (which the conversation doesn't show), its original.
 */
async function anchorFor(ctx: QueryCtx, messageId: string) {
  const anchor = await messageById(ctx, messageId);
  if (anchor?.threadOnly !== true || anchor.threadId === undefined) {
    return anchor;
  }
  return messageById(ctx, anchor.threadId);
}

/**
 * Half a page on each side of one message the conversation shows, so it
 * can open centered. A reply kept in its thread opens at its original.
 */
export async function around(
  ctx: QueryCtx,
  conversationId: string,
  messageId: string,
): Promise<MessagePage | null> {
  const anchor = await anchorFor(ctx, messageId);
  if (anchor?.conversationId !== conversationId || anchor.threadOnly === true) {
    return null;
  }
  const scope = { conversationId };
  const half = Math.floor(MESSAGE_PAGE_SIZE / 2);
  const older = await olderThan(ctx, scope, anchor.sentAt, half);
  const newer = await newerThan(ctx, scope, anchor.sentAt, true, half);
  return {
    hasNewer: newer.hasMore,
    hasOlder: older.hasMore,
    messages: [...older.messages, ...newer.messages],
  };
}

/** A page's size: `limit` if given, within 1 and `MESSAGE_PAGE_SIZE`. */
function pageSize(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit)) return MESSAGE_PAGE_SIZE;
  return Math.min(MESSAGE_PAGE_SIZE, Math.max(1, Math.floor(limit)));
}

/**
 * One page by whichever cursor was given: older than `before`, newer than
 * `after` (at most `limit` messages), or the latest.
 */
export async function pageOf(
  ctx: QueryCtx,
  scope: Scope,
  { after, before, limit }: { after?: number; before?: number; limit?: number },
): Promise<MessagePage> {
  if (after === undefined) {
    const older = await olderThan(ctx, scope, before);
    return {
      hasNewer: before !== undefined,
      hasOlder: older.hasMore,
      messages: older.messages,
    };
  }
  const newer = await newerThan(ctx, scope, after, false, pageSize(limit));
  return { hasNewer: newer.hasMore, hasOlder: true, messages: newer.messages };
}

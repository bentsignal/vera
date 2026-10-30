import type { OperationArgs } from "@decentralized-convex/plugin";

import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { messagesProtocol } from "./protocol.ts";
import { fail } from "./model.ts";
import {
  ACTIVITY_HORIZON,
  ACTIVITY_SEEN_LIFETIME,
  MAX_ACTIVITY_SIGHTINGS,
} from "./protocol.ts";

// Recording that activity items were seen: on screen in an activity view
// (`markActivitySeen`), or by reading their conversation.

type Args = OperationArgs<
  (typeof messagesProtocol)["mutations"]["markActivitySeen"]
>;

/** The newest reactions to the caller's messages that are looked at. */
export const MAX_REACTIONS_SCANNED = 500;
/** The newest mentions of the caller that are looked at. */
export const MAX_MENTIONS_SCANNED = 200;
/** The newest replies to the caller's messages that are looked at. */
export const MAX_REPLIES_SCANNED = 200;
const MAX_KEY_LENGTH = 300;
/** Old sightings deleted per `markActivitySeen`, so it stays quick. */
const MAX_PRUNED = 20;

/** The item for messages others sent in a conversation. */
export function messagesKey(conversationId: string) {
  return `messages:${conversationId}`;
}

/** The item for others' reactions to one of the caller's messages. */
export function reactionsKey(messageId: string) {
  return `reactions:${messageId}`;
}

/** The item for a message that @mentions the caller. */
export function mentionKey(messageId: string) {
  return `mention:${messageId}`;
}

/** The item for a reply to the caller's message, sent in its conversation. */
export function replyKey(messageId: string) {
  return `reply:${messageId}`;
}

/** The item for others' replies in a thread the caller is in. */
export function threadKey(threadId: string) {
  return `thread:${threadId}`;
}

/** Every time the account saw an item, oldest first. */
export function sightingsOf(ctx: QueryCtx, accountId: string, key: string) {
  return ctx.db
    .query("activitySightings")
    .withIndex("by_account_key", (index) =>
      index.eq("accountId", accountId).eq("key", key),
    )
    .collect();
}

/**
 * Records that the account saw an item through `through`. Seeing it again
 * without anything new changes nothing, so it still goes a day after it
 * was first seen.
 */
export async function recordSighting(
  ctx: MutationCtx,
  self: string,
  sighting: { key: string; now: number; through: number },
) {
  const { key, now } = sighting;
  const rows = await sightingsOf(ctx, self, key);
  const through = Math.min(sighting.through, now);
  const latest = rows.at(-1);
  if (latest !== undefined && latest.through >= through) return;
  await ctx.db.insert("activitySightings", {
    accountId: self,
    key,
    seenAt: now,
    through,
  });
  // Of the sightings over a day old, only the newest hides anything.
  const old = rows.filter(
    ({ seenAt }) => seenAt <= now - ACTIVITY_SEEN_LIFETIME,
  );
  for (const row of old.slice(0, -1)) await ctx.db.delete(row._id);
}

/** Records that items came into view, through their newest activity then. */
export async function markActivitySeen(
  ctx: MutationCtx,
  self: string,
  args: Args,
) {
  if (args.items.length > MAX_ACTIVITY_SIGHTINGS) fail("TOO_MANY_ITEMS");
  const now = Date.now();
  for (const { key, through } of args.items) {
    if (key.length === 0 || key.length > MAX_KEY_LENGTH) fail("INVALID_KEY");
    if (!Number.isFinite(through)) fail("INVALID_SIGHTING");
    await recordSighting(ctx, self, { key, now, through });
  }
  // Sightings from before the horizon hide nothing that could still show.
  const stale = await ctx.db
    .query("activitySightings")
    .withIndex("by_account_seen", (index) =>
      index.eq("accountId", self).lt("seenAt", now - ACTIVITY_HORIZON),
    )
    .take(MAX_PRUNED);
  for (const row of stale) await ctx.db.delete(row._id);
  return null;
}

/**
 * Reading a conversation sees its activity: its messages, mentions of the
 * caller, and replies to the caller through `readAt` (but not those kept
 * in threads), and every reaction so far to the caller's messages in it.
 * Each is seen through its newest activity, so reading again with nothing
 * new writes nothing (and so doesn't rerun the caller's activity).
 */
export async function seeConversationActivity(
  ctx: MutationCtx,
  self: string,
  conversationId: string,
  readAt: number,
) {
  const now = Date.now();
  await recordSighting(ctx, self, {
    key: messagesKey(conversationId),
    now,
    through: readAt,
  });
  await seeReactions(ctx, self, { conversationId, now });
  await seeMentions(ctx, self, { conversationId, now, readAt });
  await seeReplies(ctx, self, { conversationId, now, readAt });
}

/**
 * Sees others' reactions so far to the caller's messages in a
 * conversation, each message's through its newest.
 */
async function seeReactions(
  ctx: MutationCtx,
  self: string,
  place: { conversationId: string; now: number },
) {
  const { conversationId, now } = place;
  const reactions = await ctx.db
    .query("reactions")
    .withIndex("by_author_conversation_reacted", (index) =>
      index
        .eq("messageAuthorId", self)
        .eq("conversationId", conversationId)
        .gt("reactedAt", now - ACTIVITY_HORIZON),
    )
    .order("desc")
    .take(MAX_REACTIONS_SCANNED);
  const newest = new Map<string, number>();
  for (const { accountId, messageId, reactedAt } of reactions) {
    if (accountId === self || newest.has(messageId)) continue;
    newest.set(messageId, reactedAt);
  }
  for (const [messageId, through] of newest) {
    await recordSighting(ctx, self, {
      key: reactionsKey(messageId),
      now,
      through,
    });
  }
}

/** Sees the replies to the caller sent in a conversation through `readAt`. */
async function seeReplies(
  ctx: MutationCtx,
  self: string,
  place: { conversationId: string; now: number; readAt: number },
) {
  const { conversationId, now, readAt } = place;
  const replies = await ctx.db
    .query("messages")
    .withIndex("by_quote_author_conversation_sent", (index) =>
      index
        .eq("quote.authorId", self)
        .eq("conversationId", conversationId)
        .gt("sentAt", now - ACTIVITY_HORIZON)
        .lte("sentAt", readAt),
    )
    .take(MAX_REPLIES_SCANNED);
  for (const reply of replies) {
    if (reply.threadOnly === true) continue;
    await recordSighting(ctx, self, {
      key: replyKey(reply.messageId),
      now,
      through: reply.sentAt,
    });
  }
}

/**
 * Sees the mentions of the caller through `readAt` in a conversation, or
 * with `threadId`, the ones in replies kept in that thread.
 */
export async function seeMentions(
  ctx: MutationCtx,
  self: string,
  place: {
    conversationId: string;
    now: number;
    readAt: number;
    threadId?: string;
  },
) {
  const { conversationId, now, readAt, threadId } = place;
  const mentions = await ctx.db
    .query("mentions")
    .withIndex("by_account_conversation_sent", (index) =>
      index
        .eq("accountId", self)
        .eq("conversationId", conversationId)
        .gt("sentAt", now - ACTIVITY_HORIZON)
        .lte("sentAt", readAt),
    )
    .take(MAX_MENTIONS_SCANNED);
  for (const row of mentions) {
    if (row.threadId !== threadId) continue;
    await recordSighting(ctx, self, {
      key: mentionKey(row.messageId),
      now,
      through: row.sentAt,
    });
  }
}

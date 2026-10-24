import type { Doc } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
import type { Scope } from "./activityScope.ts";
import type { ActivityItem } from "./protocol.ts";
import {
  isHeard,
  leftForMention,
  messageById,
  seenState,
} from "./activityScope.ts";
import { alertsFor } from "./alerts.ts";
import { toMessage } from "./model.ts";
import { ACTIVITY_HORIZON } from "./protocol.ts";
import {
  MAX_MENTIONS_SCANNED,
  MAX_REACTIONS_SCANNED,
  MAX_REPLIES_SCANNED,
  mentionKey,
  reactionsKey,
  replyKey,
} from "./sightings.ts";
import { threadMember } from "./threads.ts";

// Activity items about the caller's own messages and the caller: others'
// reactions to them, mentions, and replies.

export /** Others' reactions to the caller's messages that still show, by message. */
async function reactionItems(ctx: QueryCtx, scope: Scope) {
  const { accessTo, describe, now, self, settings } = scope;
  const rows = await ctx.db
    .query("reactions")
    .withIndex("by_author_reacted", (index) =>
      index.eq("messageAuthorId", self).gt("reactedAt", now - ACTIVITY_HORIZON),
    )
    .order("desc")
    .take(MAX_REACTIONS_SCANNED);
  const byMessage = new Map<string, Doc<"reactions">[]>();
  for (const row of rows) {
    if (row.accountId === self) continue;
    byMessage.set(row.messageId, [
      ...(byMessage.get(row.messageId) ?? []),
      row,
    ]);
  }
  return Promise.all(
    [...byMessage].map(
      async ([messageId, reactions]): Promise<ActivityItem | null> => {
        const conversationId = reactions[0]?.conversationId ?? "";
        const found = await accessTo(conversationId);
        if (found === null || !isHeard(found, alertsFor(found, settings))) {
          return null;
        }
        const key = reactionsKey(messageId);
        const { goneThrough, seen } = await seenState(ctx, self, key, now);
        const shown = reactions.filter(
          ({ reactedAt }) =>
            reactedAt > Math.max(goneThrough, found.alertsSince),
        );
        const newest = shown[0];
        if (newest === undefined) return null;
        const message = await messageById(ctx, messageId);
        if (message?.authorId !== self) return null;
        return {
          ...seen,
          at: newest.reactedAt,
          conversation: await describe(found.conversation),
          key,
          kind: "reactions",
          message: toMessage(message),
          reactions: shown.map(({ accountId, emoji, reactedAt }) => ({
            accountId,
            emoji,
            messageId,
            reactedAt,
          })),
        };
      },
    ),
  );
}

export /**
 * Messages that @mention the caller and still show, an item each, with
 * those that say their name or a keyword instead (`said`). A mention shows from any conversation that alerts about something, even a
 * channel left out of the inbox. One in a reply kept in its thread shows
 * only to apps that show threads, since only they can open it.
 */
async function mentionItems(ctx: QueryCtx, scope: Scope) {
  const { accessTo, describe, now, self, settings } = scope;
  const rows = await ctx.db
    .query("mentions")
    .withIndex("by_account_sent", (index) =>
      index.eq("accountId", self).gt("sentAt", now - ACTIVITY_HORIZON),
    )
    .order("desc")
    .take(MAX_MENTIONS_SCANNED);
  return Promise.all(
    rows.map(async (row): Promise<ActivityItem | null> => {
      if (row.threadId !== undefined && !scope.threads) return null;
      const found = await accessTo(row.conversationId);
      if (found === null || alertsFor(found, settings) === "none") return null;
      const key = mentionKey(row.messageId);
      const { goneThrough, seen } = await seenState(ctx, self, key, now);
      if (row.sentAt <= Math.max(goneThrough, found.alertsSince)) return null;
      const message = await messageById(ctx, row.messageId);
      if (message === null || message.authorId === self) return null;
      return {
        ...seen,
        at: message.sentAt,
        conversation: await describe(found.conversation),
        key,
        kind: "mention",
        message: toMessage(message),
        ...(row.said === undefined ? {} : { said: row.said }),
      };
    }),
  );
}

/**
 * Whether a reply to the caller is someone else's, sent in the
 * conversation, and doesn't mention them (its mention shows instead).
 */
function isReplyFromOthers(scope: Scope, reply: Doc<"messages">) {
  return (
    reply.authorId !== scope.self &&
    reply.threadOnly !== true &&
    !leftForMention(scope, reply)
  );
}

export /**
 * Replies others sent in groups and channels to the caller's messages, an
 * item each, from the conversation (those kept in a thread are its
 * thread's). Like a mention, a reply shows from any conversation that
 * alerts about something, even a channel left out of the inbox, but not
 * from a thread whose bell the caller turned off, and not when it also
 * mentions them (its mention shows). In a direct message everything is to
 * the caller, so the Inbox has it.
 */
async function replyItems(ctx: QueryCtx, scope: Scope) {
  const { accessTo, describe, now, self, settings } = scope;
  const replies = await ctx.db
    .query("messages")
    .withIndex("by_quote_author_sent", (index) =>
      index.eq("quote.authorId", self).gt("sentAt", now - ACTIVITY_HORIZON),
    )
    .order("desc")
    .take(MAX_REPLIES_SCANNED);
  return Promise.all(
    replies.map(async (reply): Promise<ActivityItem | null> => {
      if (!isReplyFromOthers(scope, reply)) return null;
      const found = await accessTo(reply.conversationId);
      if (found === null || found.conversation.kind === "direct") return null;
      if (alertsFor(found, settings) === "none") return null;
      const key = replyKey(reply.messageId);
      const [{ goneThrough, seen }, member] = await Promise.all([
        seenState(ctx, self, key, now),
        reply.threadId === undefined
          ? null
          : threadMember(ctx, reply.threadId, self),
      ]);
      if (member?.unfollowed === true) return null;
      if (reply.sentAt <= Math.max(goneThrough, found.alertsSince)) {
        return null;
      }
      return {
        ...seen,
        at: reply.sentAt,
        conversation: await describe(found.conversation),
        key,
        kind: "reply",
        message: toMessage(reply),
      };
    }),
  );
}

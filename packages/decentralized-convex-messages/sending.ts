import type { OperationArgs } from "@decentralized-convex/plugin";

import type { MutationCtx } from "./_generated/server.js";
import type { messagesProtocol } from "./protocol.ts";
import { internal } from "./_generated/api.js";
import { cardsForMessage, GIVE_UP_AFTER_MS } from "./linkCache.ts";
import { previewedUrls } from "./links.ts";
import { recordMentions, validMentions } from "./mentions.ts";
import { fail, requireAccess, toMessage, upsertMember } from "./model.ts";
import { startFetches } from "./previews.ts";
import { addReply, replyTo } from "./threads.ts";
import { validateMessage } from "./validation.ts";

// Sending a message, or a reply in a thread, and who it @mentions.

type Args = OperationArgs<(typeof messagesProtocol)["mutations"]["send"]>;

/**
 * A new message's link cards: they start out from what was prefetched while
 * the message was typed, and the rest fill in as their fetches finish.
 */
export async function startLinkCards(
  ctx: MutationCtx,
  messageId: string,
  body: string,
  now: number,
) {
  const links = previewedUrls(body);
  if (links.length === 0) return undefined;
  const { cards, toFetch, waiting } = await cardsForMessage(
    ctx,
    messageId,
    links,
    now,
  );
  if (waiting.length > 0) {
    await startFetches(ctx, toFetch);
    await ctx.scheduler.runAfter(GIVE_UP_AFTER_MS, internal.previews.giveUp, {
      messageId,
    });
  }
  return cards;
}

export async function send(
  ctx: MutationCtx,
  self: string,
  authorName: string,
  args: Args,
) {
  const access = await requireAccess(ctx, args.conversationId, self);
  const body = args.body.trim();
  validateMessage(body, args.attachments);

  const retried = await alreadySent(ctx, self, args.messageId);
  if (retried !== null) return retried;

  const sentAt = Date.now();
  const reply =
    args.threadId === undefined
      ? undefined
      : await replyTo(ctx, args.conversationId, args.threadId, args.threadOnly);
  const linkPreviews = await startLinkCards(ctx, args.messageId, body, sentAt);
  const mentions = await validMentions(ctx, access, self, body, args.mentions);
  const message = {
    attachments: args.attachments,
    authorId: self,
    authorName,
    body,
    conversationId: args.conversationId,
    linkPreview: linkPreviews?.[0]?.preview ?? undefined,
    linkPreviews,
    mentions,
    messageId: args.messageId,
    sentAt,
    ...replyFields(reply),
  };
  await ctx.db.insert("messages", message);
  await recordMentions(ctx, message);
  if (reply !== undefined) {
    await addReply(ctx, { ...reply, authorId: self, sentAt });
  }
  // A reply kept in its thread doesn't move the conversation up the inbox,
  // nor is it what was last read there.
  if (reply?.threadOnly !== true) {
    await ctx.db.patch(access.conversation._id, { updatedAt: sentAt });
    await upsertMember(ctx, access, self, { lastReadAt: sentAt });
  }
  await ctx.scheduler.runAfter(0, internal.notifications.send, {
    messageId: args.messageId,
  });
  return { ...message, linkPreview: message.linkPreview ?? null };
}

/**
 * A retried send's message, already stored. Another author's ID is
 * taken.
 */
async function alreadySent(ctx: MutationCtx, self: string, messageId: string) {
  const existing = await ctx.db
    .query("messages")
    .withIndex("by_message", (index) => index.eq("messageId", messageId))
    .unique();
  if (existing === null) return null;
  if (existing.authorId !== self) fail("MESSAGE_ID_TAKEN");
  return toMessage(existing);
}

/** What a reply stores besides a message's fields. */
function replyFields(reply: Awaited<ReturnType<typeof replyTo>> | undefined) {
  if (reply === undefined) return {};
  return {
    quote: reply.quote,
    threadId: reply.threadId,
    threadOnly: reply.threadOnly,
  };
}

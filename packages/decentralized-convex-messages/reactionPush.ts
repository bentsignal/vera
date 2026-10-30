import { v } from "convex/values";

import type { QueryCtx } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { internalAction, internalQuery } from "./_generated/server.js";
import { alertsOf } from "./alerts.ts";
import { shownTo } from "./contacts.ts";
import { badgeCounts, badgeField, deliver, recipientOf } from "./delivery.ts";
import { getConversation } from "./model.ts";
import {
  accountProfile,
  ANDROID_DELIVERY,
  conversationName,
  previewText,
} from "./pushParts.ts";
import { wantsPush } from "./settings.ts";

/**
 * Who to tell about a reaction (the message's author, on each of their
 * devices), and what to show them. Null when nobody should hear about it:
 * the reaction is gone, the author reacted themselves, or they muted the
 * conversation or turned reaction pushes off.
 */
/**
 * The message reacted to, unless it's the reactor's own or was deleted
 * since.
 */
async function othersMessage(
  ctx: QueryCtx,
  messageId: string,
  reactorId: string,
) {
  const message = await ctx.db
    .query("messages")
    .withIndex("by_message", (index) => index.eq("messageId", messageId))
    .unique();
  if (message === null || message.deletedAt !== undefined) return null;
  return message.authorId === reactorId ? null : message;
}

export const reactionTargets = internalQuery({
  args: { emoji: v.string(), messageId: v.string(), reactorId: v.string() },
  handler: async (ctx, { emoji, messageId, reactorId }) => {
    const reaction = await ctx.db
      .query("reactions")
      .withIndex("by_message_account", (index) =>
        index.eq("messageId", messageId).eq("accountId", reactorId),
      )
      .collect();
    if (!reaction.some((row) => row.emoji === emoji)) return null;
    const message = await othersMessage(ctx, messageId, reactorId);
    if (message === null) return null;
    const conversation = await getConversation(ctx, message.conversationId);
    if (conversation === null) return null;
    const author = message.authorId;
    const level = await alertsOf(ctx, conversation.conversationId, author);
    if (level === null || level === "none") return null;
    if (!(await wantsPush(ctx, author, "reactions"))) return null;
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_account", (index) => index.eq("accountId", author))
      .collect();
    return {
      conversationId: conversation.conversationId,
      conversationName: await conversationName(ctx, conversation),
      message: previewText(message),
      // A reaction to a reply kept in its thread opens the thread.
      threadId: message.threadOnly === true ? (message.threadId ?? null) : null,
      recipients: tokens.map(recipientOf),
      // The author's own name and photo for the reactor, if they gave one.
      reactorAsContact: (await shownTo(ctx, author, [reactorId]))[reactorId],
    };
  },
});

/**
 * The reactor as the author sees them: by the name and photo the author
 * gave them as a contact, or else their own.
 */
function reactorShown(
  asContact: { avatarUrl?: string; name?: string } | undefined,
  profile: { avatarUrl: string | null; displayName: string } | null,
  storedName: string,
) {
  return {
    senderAvatarUrl: asContact?.avatarUrl ?? profile?.avatarUrl ?? null,
    senderName: asContact?.name ?? profile?.displayName ?? storedName,
  };
}

/**
 * Tells a message's author someone reacted to it: the reactor as the
 * sender (their photo on iOS), "Reacted ❤️ to “…”" as the body, and
 * `data.kind` `reaction` with the conversation and message, so a tap opens
 * the message. Sent a moment after the reaction, so a quick change of mind
 * (tapping it off again) sends nothing.
 */
export const sendReaction = internalAction({
  args: {
    emoji: v.string(),
    messageId: v.string(),
    reactorId: v.string(),
    reactorName: v.string(),
  },
  handler: async (ctx, { emoji, messageId, reactorId, reactorName }) => {
    const target = await ctx.runQuery(internal.reactionPush.reactionTargets, {
      emoji,
      messageId,
      reactorId,
    });
    if (target === null || target.recipients.length === 0) return;
    const [reactor, badges] = await Promise.all([
      accountProfile(reactorId),
      badgeCounts(ctx, target.recipients),
    ]);
    const { senderAvatarUrl, senderName } = reactorShown(
      target.reactorAsContact,
      reactor,
      reactorName,
    );
    const { conversationName } = target;
    await deliver(
      ctx,
      target.recipients.map((recipient) => ({
        ...badgeField(badges, recipient),
        body:
          target.message.length > 0
            ? `Reacted ${emoji} to “${target.message}”`
            : `Reacted ${emoji} to your message`,
        data: {
          accountId: recipient.accountId,
          conversationId: target.conversationId,
          conversationName,
          emoji,
          kind: "reaction",
          messageId,
          senderAvatarUrl,
          senderId: reactorId,
          senderName,
          ...(target.threadId === null ? {} : { threadId: target.threadId }),
        },
        ...ANDROID_DELIVERY,
        mutableContent: true,
        sound: "default",
        ...(conversationName === null ? {} : { subtitle: conversationName }),
        threadId: target.conversationId,
        title: senderName,
        to: recipient.token,
      })),
    );
  },
});

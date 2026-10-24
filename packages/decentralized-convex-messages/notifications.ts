import { v } from "convex/values";

import type { Listener, ReplyPush } from "./listeners.ts";
import { internal } from "./_generated/api.js";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server.js";
import { badgeCount } from "./badges.ts";
import { badgeCounts, badgeField, deliver, recipientOf } from "./delivery.ts";
import { listeners, nameListeners } from "./listeners.ts";
import { saysName } from "./mentions.ts";
import { getConversation, getSpace, memberAddresses } from "./model.ts";
import { listNames } from "./naming.ts";
import { inboxKind } from "./protocol.ts";
import {
  accountProfile,
  ANDROID_DELIVERY,
  conversationName,
  displayNames,
  previewText,
} from "./pushParts.ts";
import { wantsPush } from "./settings.ts";

/** Who to notify about a message (see `listeners`), and what to show them. */
export const targets = internalQuery({
  args: { messageId: v.string() },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db
      .query("messages")
      .withIndex("by_message", (index) => index.eq("messageId", messageId))
      .unique();
    if (message === null) return null;
    const conversation = await getConversation(ctx, message.conversationId);
    if (conversation === null) return null;

    const members = await memberAddresses(ctx, conversation);
    async function devices(heard: readonly Listener[]) {
      const found: (ReturnType<typeof recipientOf> & { reply: ReplyPush })[] =
        [];
      for (const { accountId, reply } of heard) {
        const rows = await ctx.db
          .query("pushTokens")
          .withIndex("by_account", (index) => index.eq("accountId", accountId))
          .collect();
        found.push(...rows.map((row) => ({ ...recipientOf(row), reply })));
      }
      return found;
    }
    const heard = await listeners(ctx, message, conversation, members);
    const named = await nameListeners(
      ctx,
      message,
      conversation,
      members,
      heard,
    );
    return {
      body: previewText(message),
      // Who hears of it only if it says their name, which `send` checks.
      nameRecipients: await devices(named),
      recipients: await devices(heard),
      text: named.length === 0 ? "" : message.body,
      conversationId: conversation.conversationId,
      conversationName: await conversationName(ctx, conversation),
      messageId: message.messageId,
      // A group without a name is titled with the other members' names,
      // which differ for each recipient.
      unnamedGroupMembers:
        conversation.kind === "group" && conversation.name === undefined
          ? members
          : null,
      kind: conversation.kind,
      senderId: message.authorId,
      senderName: message.authorName,
      threadId: message.threadId ?? null,
      threadOnly: message.threadOnly === true,
    };
  },
});

/**
 * The devices of the accounts whose display name the text says. A name
 * that can't be looked up says nothing.
 */
async function namedIn<Device extends { accountId: string }>(
  text: string,
  devices: readonly Device[],
) {
  const accountIds = [...new Set(devices.map(({ accountId }) => accountId))];
  const profiles = await Promise.all(accountIds.map(accountProfile));
  const named = new Set(
    accountIds.filter((_, index) => {
      const name = profiles[index]?.displayName;
      return name !== undefined && saysName(text, name);
    }),
  );
  return devices.filter(({ accountId }) => named.has(accountId));
}

/** A reply push's body: what it is, then the reply. */
function replyBody(reply: ReplyPush, body: string) {
  if (reply === null) return body;
  const what =
    reply === "yours" ? "Replied to your message" : "Replied in a thread";
  return body.length === 0 ? what : `${what}: ${body}`;
}

/**
 * The account's app icon badge (see `badgeCount`), read in its own query so
 * a push to a large space doesn't count every member in one transaction.
 */
export const badge = internalQuery({
  args: {
    accountId: v.string(),
    inbox: v.optional(v.array(inboxKind)),
    threads: v.optional(v.boolean()),
  },
  handler: (ctx, { accountId, inbox, threads }) =>
    badgeCount(
      ctx,
      accountId,
      { mentions: true, threads: threads === true },
      inbox,
    ),
});

/** Who to tell about new space invitations, and the space's name. */
export const inviteTargets = internalQuery({
  args: { accountIds: v.array(v.string()), spaceId: v.string() },
  handler: async (ctx, { accountIds, spaceId }) => {
    const space = await getSpace(ctx, spaceId);
    if (space === null) return null;
    const recipients: ReturnType<typeof recipientOf>[] = [];
    for (const accountId of accountIds) {
      // Skip anyone who already answered before this ran.
      const invite = await ctx.db
        .query("spaceInvites")
        .withIndex("by_space_account", (index) =>
          index.eq("spaceId", spaceId).eq("accountId", accountId),
        )
        .unique();
      if (invite === null) continue;
      if (!(await wantsPush(ctx, accountId, "invites"))) continue;
      const rows = await ctx.db
        .query("pushTokens")
        .withIndex("by_account", (index) => index.eq("accountId", accountId))
        .collect();
      recipients.push(...rows.map(recipientOf));
    }
    return { recipients, spaceName: space.name };
  },
});

/**
 * Sends one Expo push per recipient device. iOS shows it as a communication
 * notification: the app's Notification Service Extension reads `data`
 * (sender, avatar, conversation) and turns it into a message intent, so the
 * sender's photo becomes the icon. Without the extension, the title is the
 * sender and the subtitle names the group or channel.
 */
export const send = internalAction({
  args: { messageId: v.string() },
  handler: async (ctx, { messageId }) => {
    const target = await ctx.runQuery(internal.notifications.targets, {
      messageId,
    });
    if (target === null) return;
    const recipients = [
      ...target.recipients,
      ...(await namedIn(target.text, target.nameRecipients)),
    ];
    if (recipients.length === 0) return;
    const [sender, badges, memberNames] = await Promise.all([
      accountProfile(target.senderId),
      badgeCounts(ctx, recipients),
      displayNames([...(target.unnamedGroupMembers ?? [])].sort()),
    ]);
    const senderName = sender?.displayName ?? target.senderName;
    const { conversationName: name } = target;
    /** An unnamed group's title leaves out whoever it's for. */
    function conversationNameFor(accountId: string) {
      const others = memberNames.filter(([member]) => member !== accountId);
      return others.length === 0
        ? name
        : listNames(others.map(([, other]) => other));
    }

    await deliver(
      ctx,
      recipients.map((recipient) => {
        const { accountId, reply, token } = recipient;
        const conversationName = conversationNameFor(accountId);
        // A reply kept in its thread opens the thread. Its `messageId` is
        // the original, where apps from before threads open the
        // conversation, since the reply isn't in it.
        const thread =
          target.threadOnly && target.threadId !== null
            ? {
                messageId: target.threadId,
                replyId: target.messageId,
                threadId: target.threadId,
              }
            : {};
        return {
          ...badgeField(badges, recipient),
          body: replyBody(reply, target.body),
          // A device signed into several accounts opens the message as
          // the account it was sent to.
          data: {
            accountId,
            conversationId: target.conversationId,
            conversationName,
            kind: target.kind,
            messageId: target.messageId,
            senderAvatarUrl: sender?.avatarUrl ?? null,
            senderId: target.senderId,
            senderName,
            ...thread,
          },
          ...ANDROID_DELIVERY,
          // Lets the iOS Notification Service Extension rewrite it.
          mutableContent: true,
          sound: "default",
          ...(conversationName === null ? {} : { subtitle: conversationName }),
          threadId: target.conversationId,
          title: senderName,
          to: token,
        };
      }),
    );
  },
});

/**
 * Tells newly invited people about a space invitation. `data.kind` is
 * `spaceInvite` and `data.spaceId` names the space, so the app can open its
 * invites and dismiss the notification once the invite is answered.
 */
export const sendInvite = internalAction({
  args: {
    accountIds: v.array(v.string()),
    invitedBy: v.string(),
    spaceId: v.string(),
  },
  handler: async (ctx, { accountIds, invitedBy, spaceId }) => {
    const target = await ctx.runQuery(internal.notifications.inviteTargets, {
      accountIds,
      spaceId,
    });
    if (target === null || target.recipients.length === 0) return;
    const [inviter, badges] = await Promise.all([
      accountProfile(invitedBy),
      badgeCounts(ctx, target.recipients),
    ]);
    const inviterName = inviter?.displayName ?? invitedBy.split("@")[0];
    await deliver(
      ctx,
      target.recipients.map((recipient) => ({
        ...badgeField(badges, recipient),
        body: `${inviterName} invited you to join ${target.spaceName}`,
        data: {
          accountId: recipient.accountId,
          invitedBy,
          kind: "spaceInvite",
          spaceId,
          spaceName: target.spaceName,
        },
        ...ANDROID_DELIVERY,
        sound: "default",
        title: target.spaceName,
        to: recipient.token,
      })),
    );
  },
});
export const removeTokens = internalMutation({
  args: { tokens: v.array(v.string()) },
  handler: async (ctx, { tokens }) => {
    for (const token of tokens) {
      const rows = await ctx.db
        .query("pushTokens")
        .withIndex("by_token", (index) => index.eq("token", token))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
  },
});

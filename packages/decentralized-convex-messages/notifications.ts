import type { AccountProfile } from "@decentralized-convex/accounts";
import { accountsProtocol } from "@decentralized-convex/accounts";
import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel.js";
import { internal } from "./_generated/api.js";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server.js";
import { badgeCount } from "./badges.ts";
import { badgeCounts, badgeField, deliver } from "./delivery.ts";
import {
  getConversation,
  getMember,
  getSpace,
  memberAddresses,
} from "./model.ts";
import { listNames } from "./naming.ts";

/**
 * Android: the app's high-importance `messages` channel (the default
 * channel doesn't pop up), and high FCM priority, without which Android
 * delays or drops pushes while the app is closed or the phone is idle.
 */
const ANDROID_DELIVERY = { channelId: "messages", priority: "high" } as const;

/** Who to notify about a message, and what to show them. */
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
    const recipients: { accountId: string; token: string }[] = [];
    for (const accountId of members) {
      if (accountId === message.authorId) continue;
      const member = await getMember(
        ctx,
        conversation.conversationId,
        accountId,
      );
      if (member?.muted === true) continue;
      const rows = await ctx.db
        .query("pushTokens")
        .withIndex("by_account", (index) => index.eq("accountId", accountId))
        .collect();
      recipients.push(...rows.map(({ token }) => ({ accountId, token })));
    }
    return {
      body: previewText(message),
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
      recipients,
      senderId: message.authorId,
      senderName: message.authorName,
    };
  },
});

/**
 * The account's app icon badge (see `badgeCount`), read in its own query so
 * a push to a large space doesn't count every member in one transaction.
 */
export const badge = internalQuery({
  args: { accountId: v.string() },
  handler: (ctx, { accountId }) => badgeCount(ctx, accountId),
});

/** Who to tell about new space invitations, and the space's name. */
export const inviteTargets = internalQuery({
  args: { accountIds: v.array(v.string()), spaceId: v.string() },
  handler: async (ctx, { accountIds, spaceId }) => {
    const space = await getSpace(ctx, spaceId);
    if (space === null) return null;
    const recipients: { accountId: string; token: string }[] = [];
    for (const accountId of accountIds) {
      // Skip anyone who already answered before this ran.
      const invite = await ctx.db
        .query("spaceInvites")
        .withIndex("by_space_account", (index) =>
          index.eq("spaceId", spaceId).eq("accountId", accountId),
        )
        .unique();
      if (invite === null) continue;
      const rows = await ctx.db
        .query("pushTokens")
        .withIndex("by_account", (index) => index.eq("accountId", accountId))
        .collect();
      recipients.push(...rows.map(({ token }) => ({ accountId, token })));
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
    if (target === null || target.recipients.length === 0) return;
    const [sender, badges, memberNames] = await Promise.all([
      accountProfile(target.senderId),
      badgeCounts(ctx, target.recipients),
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
      target.recipients.map(({ accountId, token }) => {
        const conversationName = conversationNameFor(accountId);
        return {
          ...badgeField(badges.get(accountId)),
          body: target.body,
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
      target.recipients.map(({ accountId, token }) => ({
        ...badgeField(badges.get(accountId)),
        body: `${inviterName} invited you to join ${target.spaceName}`,
        data: {
          accountId,
          invitedBy,
          kind: "spaceInvite",
          spaceId,
          spaceName: target.spaceName,
        },
        ...ANDROID_DELIVERY,
        sound: "default",
        title: target.spaceName,
        to: token,
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

function previewText(message: Doc<"messages">) {
  if (message.body.length > 0) return message.body.slice(0, 200);
  const [first] = message.attachments;
  if (first === undefined) return "";
  const count = message.attachments.length;
  const noun = { file: "file", image: "photo", video: "video" }[first.kind];
  return count === 1 ? `Sent a ${noun}` : `Sent ${count} attachments`;
}

/** The group or channel name shown under the sender; null for DMs. */
async function conversationName(
  ctx: Parameters<typeof getConversation>[0],
  conversation: Doc<"conversations">,
) {
  if (conversation.kind === "direct") return null;
  if (conversation.kind === "group") return conversation.name ?? "Group";
  const space =
    conversation.spaceId === undefined
      ? null
      : await ctx.db
          .query("spaces")
          .withIndex("by_space", (index) =>
            index.eq("spaceId", conversation.spaceId ?? ""),
          )
          .unique();
  const channel = `#${conversation.name ?? "channel"}`;
  return space === null ? channel : `${space.name} ${channel}`;
}

/** Each account's display name (its username without a profile), in order. */
async function displayNames(accountIds: readonly string[]) {
  const profiles = await Promise.all(accountIds.map(accountProfile));
  return accountIds.map(
    (accountId, index) =>
      [
        accountId,
        profiles[index]?.displayName ??
          accountId.slice(0, accountId.indexOf("@")),
      ] as const,
  );
}

/**
 * An account's Accounts profile, for their current display name and photo.
 * Messages are stored on the author's home PDS, so the sender's profile is
 * on this deployment (other members' may not be, and come back null), but a
 * Convex Component cannot read a sibling Component. It
 * asks this PDS's public root router instead, exactly as a client would
 * (`accounts.getProfile` needs no session). Messages requires `accounts`,
 * so the plugin is always installed. Any failure returns null and the
 * notification falls back to the name stored on the message.
 */
async function accountProfile(accountId: string) {
  try {
    const response = await fetch(`${env.CONVEX_CLOUD_URL}/api/query`, {
      body: JSON.stringify({
        args: {
          lastChanged: accountsProtocol.lastChanged,
          operation: { args: { accountId }, type: "getProfile" },
          plugin: accountsProtocol.name,
          version: accountsProtocol.version,
        },
        format: "json",
        path: "pds:dispatchQuery",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) return null;
    return parseProfile(await response.json());
  } catch (error) {
    console.error("Profile lookup failed", error);
    return null;
  }
}

/** Reads `{ status, value: { value: profile } }` from the Convex HTTP API. */
function parseProfile(body: unknown): AccountProfile | null {
  const result = field(field(body, "value"), "value");
  const displayName = field(result, "displayName");
  const avatarUrl = field(result, "avatarUrl");
  const accountId = field(result, "accountId");
  if (typeof displayName !== "string" || typeof accountId !== "string") {
    return null;
  }
  return {
    accountId,
    avatarUrl: typeof avatarUrl === "string" ? avatarUrl : null,
    displayName,
  };
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

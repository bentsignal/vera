import { DECENTRALIZED_CONVEX_VERSION } from "@decentralized-convex/core";
import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { v } from "convex/values";

import { activitySighting } from "./activityShapes.ts";
import { decentralizedConvexPackage } from "./metadata.ts";
import { queries } from "./queries.ts";
import {
  alertLevel,
  attachment,
  inboxKind,
  mention,
  message,
  notificationSettingsChange,
  spaceInviteLink,
} from "./shapes.ts";

export * from "./activityShapes.ts";
export * from "./shapes.ts";

export const messagesProtocol = definePluginProtocol({
  lastChanged: decentralizedConvexPackage.lastChanged,
  name: "messages",
  mutations: {
    /** Opens (or returns) the one-to-one conversation with an address. */
    openDirect: defineOperation({
      args: v.object({ accountId: v.string() }),
      returns: v.object({ conversationId: v.string() }),
    }),
    /** Unnamed groups show their members; app-made IDs: see `createdId`. */
    createGroup: defineOperation({
      args: v.object({
        conversationId: v.optional(v.string()),
        members: v.array(v.string()),
        name: v.optional(v.string()),
      }),
      returns: v.object({ conversationId: v.string() }),
    }),
    renameGroup: defineOperation({
      args: v.object({ conversationId: v.string(), name: v.string() }),
      returns: v.null(),
    }),
    addGroupMembers: defineOperation({
      args: v.object({
        conversationId: v.string(),
        members: v.array(v.string()),
      }),
      returns: v.null(),
    }),
    leaveConversation: defineOperation({
      args: v.object({ conversationId: v.string() }),
      returns: v.null(),
    }),
    /**
     * With `threadId`, a reply to that message, in its thread (a reply's
     * own thread when it names a reply), quoting it. `threadOnly: true`
     * keeps it in the thread (sent from there); `false` shows it in the
     * conversation too (sent from there). Left out, as older apps do, only
     * the thread's first reply shows in the conversation. Replies kept in
     * the thread come back with `threadOnly`.
     * `mentions` names who the body @mentions by the name after each `@`;
     * any not in the group or channel, or not in the body, is left out.
     */
    send: defineOperation({
      args: v.object({
        attachments: v.array(attachment),
        body: v.string(),
        conversationId: v.string(),
        mentions: v.optional(v.array(mention)),
        messageId: v.string(),
        threadId: v.optional(v.string()),
        threadOnly: v.optional(v.boolean()),
      }),
      returns: message,
    }),
    /**
     * Changes the text of your own message, and who it @mentions (as in
     * `send`); its attachments stay. It comes back with `editedAt`.
     * Fails with `NOT_MESSAGE_AUTHOR` for anyone else's message.
     */
    editMessage: defineOperation({
      args: v.object({
        body: v.string(),
        conversationId: v.string(),
        mentions: v.optional(v.array(mention)),
        messageId: v.string(),
      }),
      returns: message,
    }),
    /**
     * Deletes your own message for everyone, with its reactions. A
     * thread's original with replies stays as `deletedAt`, emptied, so
     * its thread can still be opened; any other message is gone. Replies
     * quoting it come back with `quote.deleted`. Fails with
     * `NOT_MESSAGE_AUTHOR` for anyone else's message.
     */
    deleteMessage: defineOperation({
      args: v.object({ conversationId: v.string(), messageId: v.string() }),
      returns: v.null(),
    }),
    /** Marks a thread read up to `readAt`, which sees its activity too. */
    markThreadRead: defineOperation({
      args: v.object({
        conversationId: v.string(),
        readAt: v.number(),
        threadId: v.string(),
      }),
      returns: v.null(),
    }),
    /**
     * Turns a thread's notifications on or off for you (its bell). Its
     * original's author and everyone who replies start with them on.
     */
    setThreadFollowed: defineOperation({
      args: v.object({
        conversationId: v.string(),
        followed: v.boolean(),
        threadId: v.string(),
      }),
      returns: v.null(),
    }),
    /**
     * Starts fetching previews of links being typed, so they're ready when
     * the message is sent. Read them with `linkPreviews`.
     */
    prefetchLinkPreviews: defineOperation({
      args: v.object({ urls: v.array(v.string()) }),
      returns: v.null(),
    }),
    /**
     * Adds (`on: true`) or removes your emoji reaction to a message, or with
     * `attachment` or `link`, to one of its attachments or link previews
     * (see `reaction`). The reaction is stored on your home PDS, like the
     * messages you send.
     */
    react: defineOperation({
      args: v.object({
        attachment: v.optional(v.number()),
        conversationId: v.string(),
        emoji: v.string(),
        link: v.optional(v.number()),
        messageId: v.string(),
        on: v.boolean(),
      }),
      returns: v.null(),
    }),
    /**
     * Records that activity items came into view (see `activity`). Each
     * stays for `ACTIVITY_SEEN_LIFETIME` after it's seen, then goes, until
     * something newer happens in it.
     */
    markActivitySeen: defineOperation({
      args: v.object({ items: v.array(activitySighting) }),
      returns: v.null(),
    }),
    markRead: defineOperation({
      args: v.object({ conversationId: v.string(), readAt: v.number() }),
      returns: v.null(),
    }),
    /** `setAlerts` with `none` (muted) or `all`, for older apps. */
    setMuted: defineOperation({
      args: v.object({ conversationId: v.string(), muted: v.boolean() }),
      returns: v.null(),
    }),
    /**
     * Chooses what a conversation alerts you about, over its space's choice
     * and your defaults; choosing what it would get anyway follows those
     * again. Direct messages take `all` or `none`.
     */
    setAlerts: defineOperation({
      args: v.object({ alerts: alertLevel, conversationId: v.string() }),
      returns: v.null(),
    }),
    /** `setSpaceAlerts` with `none` (muted) or `all`, for older apps. */
    setSpaceMuted: defineOperation({
      args: v.object({ muted: v.boolean(), spaceId: v.string() }),
      returns: v.null(),
    }),
    /** What a space's channels alert you about (see `setAlerts`). */
    setSpaceAlerts: defineOperation({
      args: v.object({ alerts: alertLevel, spaceId: v.string() }),
      returns: v.null(),
    }),
    /**
     * Turns kinds of pushes on or off and sets the default alerts for
     * groups and channels; fields left out stay as they are. `groups` or
     * `channels` (from older apps) sets that default to `all` or `none`.
     */
    setNotificationSettings: defineOperation({
      args: notificationSettingsChange,
      returns: v.null(),
    }),
    /** Pins a conversation to the top of your inbox, or unpins it. */
    setPinned: defineOperation({
      args: v.object({ conversationId: v.string(), pinned: v.boolean() }),
      returns: v.null(),
    }),
    /**
     * Lists a channel in your inbox (the default) or leaves it out; it
     * stays in its space either way. Channels only.
     */
    setShowInInbox: defineOperation({
      args: v.object({ conversationId: v.string(), show: v.boolean() }),
      returns: v.null(),
    }),
    /** A space with a #general channel; app-made IDs: see `createdId`. */
    createSpace: defineOperation({
      args: v.object({
        generalChannelId: v.optional(v.string()),
        name: v.string(),
        spaceId: v.optional(v.string()),
      }),
      returns: v.object({ spaceId: v.string() }),
    }),
    renameSpace: defineOperation({
      args: v.object({ name: v.string(), spaceId: v.string() }),
      returns: v.null(),
    }),
    /**
     * Adds people to a space without asking them. Apps from before
     * invitations call it; newer ones call `inviteToSpace`.
     */
    addSpaceMembers: defineOperation({
      args: v.object({ members: v.array(v.string()), spaceId: v.string() }),
      returns: v.null(),
    }),
    /** Invites people, who join when they accept. Any member may invite. */
    inviteToSpace: defineOperation({
      args: v.object({ members: v.array(v.string()), spaceId: v.string() }),
      returns: v.null(),
    }),
    acceptSpaceInvite: defineOperation({
      args: v.object({ spaceId: v.string() }),
      returns: v.null(),
    }),
    declineSpaceInvite: defineOperation({
      args: v.object({ spaceId: v.string() }),
      returns: v.null(),
    }),
    /**
     * Makes a link into a space that lasts `expiresIn` milliseconds, or
     * forever without it. Any member may make one.
     */
    createSpaceInviteLink: defineOperation({
      args: v.object({
        expiresIn: v.optional(v.number()),
        spaceId: v.string(),
      }),
      returns: spaceInviteLink,
    }),
    /**
     * Changes how long a link lasts: `expiresIn` milliseconds from when it
     * was made, or forever without it. Its maker or a space owner may. A
     * lifetime that has already run out fails with `INVALID_EXPIRATION`.
     */
    setSpaceInviteLinkExpiry: defineOperation({
      args: v.object({
        code: v.string(),
        expiresIn: v.optional(v.number()),
      }),
      returns: spaceInviteLink,
    }),
    /** Deletes a link. Its maker or a space owner may. */
    revokeSpaceInviteLink: defineOperation({
      args: v.object({ code: v.string() }),
      returns: v.null(),
    }),
    /** Joins the space a link leads to (a member already stays one). */
    joinSpaceWithLink: defineOperation({
      args: v.object({ code: v.string() }),
      returns: v.object({ spaceId: v.string() }),
    }),
    removeSpaceMember: defineOperation({
      args: v.object({ accountId: v.string(), spaceId: v.string() }),
      returns: v.null(),
    }),
    /** App-made IDs: see `createdId`. */
    createChannel: defineOperation({
      args: v.object({
        conversationId: v.optional(v.string()),
        name: v.string(),
        spaceId: v.string(),
      }),
      returns: v.object({ conversationId: v.string() }),
    }),
    renameChannel: defineOperation({
      args: v.object({ conversationId: v.string(), name: v.string() }),
      returns: v.null(),
    }),
    deleteChannel: defineOperation({
      args: v.object({ conversationId: v.string() }),
      returns: v.null(),
    }),
    /**
     * Registers this device for the account's pushes. Apps that show
     * threads pass `threads`, so a push's badge counts threads' replies
     * (older apps can't see or clear them). Apps whose Activity is about
     * you pass `inbox`, the kinds of rows their Inbox lists, so a push's
     * badge counts those rows with something new, plus activity about you
     * (see `badgeCount`); they register again when it changes.
     */
    registerPushToken: defineOperation({
      args: v.object({
        inbox: v.optional(v.array(inboxKind)),
        threads: v.optional(v.boolean()),
        token: v.string(),
      }),
      returns: v.null(),
    }),
    unregisterPushToken: defineOperation({
      args: v.object({ token: v.string() }),
      returns: v.null(),
    }),
  },
  queries,
  requires: { accounts: DECENTRALIZED_CONVEX_VERSION },
});

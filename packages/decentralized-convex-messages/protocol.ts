import type { Infer } from "convex/values";
import { DECENTRALIZED_CONVEX_VERSION } from "@decentralized-convex/core";
import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { v } from "convex/values";

import { decentralizedConvexPackage } from "./metadata.ts";

export const MESSAGE_PAGE_SIZE = 50;

export const attachment = v.object({
  durationMs: v.optional(v.number()),
  height: v.optional(v.number()),
  kind: v.union(v.literal("image"), v.literal("video"), v.literal("file")),
  mimeType: v.string(),
  name: v.string(),
  size: v.number(),
  thumbnailUrl: v.optional(v.string()),
  url: v.string(),
  width: v.optional(v.number()),
});

export type Attachment = Infer<typeof attachment>;

export const linkPreview = v.object({
  description: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  siteName: v.optional(v.string()),
  title: v.optional(v.string()),
  url: v.string(),
});

export type LinkPreview = Infer<typeof linkPreview>;

export const message = v.object({
  attachments: v.array(attachment),
  authorId: v.string(),
  authorName: v.string(),
  body: v.string(),
  conversationId: v.string(),
  linkPreview: v.union(v.null(), linkPreview),
  messageId: v.string(),
  sentAt: v.number(),
});

export type Message = Infer<typeof message>;

export const conversationKind = v.union(
  v.literal("direct"),
  v.literal("group"),
  v.literal("channel"),
);

export const conversation = v.object({
  conversationId: v.string(),
  kind: conversationKind,
  lastMessage: v.union(v.null(), message),
  members: v.array(v.string()),
  muted: v.boolean(),
  name: v.union(v.null(), v.string()),
  // Optional so results from PDSs that predate them still validate.
  /** When the caller pinned it to the top of their inbox. */
  pinnedAt: v.optional(v.number()),
  /** Channels only: whether the caller's inbox lists it. */
  showInInbox: v.optional(v.boolean()),
  spaceId: v.union(v.null(), v.string()),
  /** Channels only: the space's name. */
  spaceName: v.optional(v.string()),
  unreadCount: v.number(),
  updatedAt: v.number(),
});

export type Conversation = Infer<typeof conversation>;

export const channel = v.object({
  conversationId: v.string(),
  name: v.string(),
  position: v.number(),
  /** Whether the caller's inbox lists it (absent from older PDSs: yes). */
  showInInbox: v.optional(v.boolean()),
  unreadCount: v.number(),
});

export type Channel = Infer<typeof channel>;

export const spaceRole = v.union(v.literal("owner"), v.literal("member"));

export const space = v.object({
  channels: v.array(channel),
  /** People invited who haven't accepted yet (absent from older PDSs). */
  invited: v.optional(v.array(v.string())),
  members: v.array(v.object({ accountId: v.string(), role: spaceRole })),
  name: v.string(),
  role: spaceRole,
  spaceId: v.string(),
  unreadCount: v.number(),
});

export type Space = Infer<typeof space>;

/** A space the caller has been invited to and hasn't answered. */
export const spaceInvite = v.object({
  invitedAt: v.number(),
  invitedBy: v.string(),
  memberCount: v.number(),
  name: v.string(),
  spaceId: v.string(),
});

export type SpaceInvite = Infer<typeof spaceInvite>;

/** A link anyone signed in can join a space with, until it expires. */
export const spaceInviteLink = v.object({
  code: v.string(),
  createdAt: v.number(),
  createdBy: v.string(),
  /** Null when it never expires. */
  expiresAt: v.union(v.null(), v.number()),
});

export type SpaceInviteLink = Infer<typeof spaceInviteLink>;

/** The space an invite link leads to, shown before joining it. */
export const spaceInviteLinkPreview = v.object({
  expiresAt: v.union(v.null(), v.number()),
  isMember: v.boolean(),
  memberCount: v.number(),
  name: v.string(),
  spaceId: v.string(),
});

export type SpaceInviteLinkPreview = Infer<typeof spaceInviteLinkPreview>;

/** The longest an invite link can last before it expires: a year. */
export const MAX_INVITE_LINK_LIFETIME = 366 * 24 * 60 * 60 * 1000;

/** One account's emoji reaction to a message. */
export const reaction = v.object({
  accountId: v.string(),
  emoji: v.string(),
  messageId: v.string(),
  reactedAt: v.number(),
});

export type Reaction = Infer<typeof reaction>;

/** At most this many messages per `reactions` query. */
export const MAX_REACTION_MESSAGES = 100;

/** Oldest first. `hasOlder`/`hasNewer` say whether more exist beyond it. */
export const messagePage = v.object({
  hasNewer: v.boolean(),
  hasOlder: v.boolean(),
  messages: v.array(message),
});

export const messagesProtocol = definePluginProtocol({
  lastChanged: decentralizedConvexPackage.lastChanged,
  name: "messages",
  mutations: {
    /** Opens (or returns) the one-to-one conversation with an address. */
    openDirect: defineOperation({
      args: v.object({ accountId: v.string() }),
      returns: v.object({ conversationId: v.string() }),
    }),
    createGroup: defineOperation({
      args: v.object({ members: v.array(v.string()), name: v.string() }),
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
    send: defineOperation({
      args: v.object({
        attachments: v.array(attachment),
        body: v.string(),
        conversationId: v.string(),
        messageId: v.string(),
      }),
      returns: message,
    }),
    /**
     * Adds (`on: true`) or removes your emoji reaction to a message. The
     * reaction is stored on your home PDS, like the messages you send.
     */
    react: defineOperation({
      args: v.object({
        conversationId: v.string(),
        emoji: v.string(),
        messageId: v.string(),
        on: v.boolean(),
      }),
      returns: v.null(),
    }),
    markRead: defineOperation({
      args: v.object({ conversationId: v.string(), readAt: v.number() }),
      returns: v.null(),
    }),
    setMuted: defineOperation({
      args: v.object({ conversationId: v.string(), muted: v.boolean() }),
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
    createSpace: defineOperation({
      args: v.object({ name: v.string() }),
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
    createChannel: defineOperation({
      args: v.object({ name: v.string(), spaceId: v.string() }),
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
    registerPushToken: defineOperation({
      args: v.object({ token: v.string() }),
      returns: v.null(),
    }),
    unregisterPushToken: defineOperation({
      args: v.object({ token: v.string() }),
      returns: v.null(),
    }),
  },
  queries: {
    /**
     * Your conversations. With `channels`, it also lists the channels of
     * your spaces that you haven't left out of it; without, it lists only
     * direct messages and groups (as apps before the unified inbox expect).
     */
    inbox: defineOperation({
      args: v.object({ channels: v.optional(v.boolean()) }),
      returns: v.array(conversation),
    }),
    conversation: defineOperation({
      args: v.object({ conversationId: v.string() }),
      returns: v.union(v.null(), conversation),
    }),
    list: defineOperation({
      // At most one cursor: older than `before`, newer than `after`, centered
      // on the `around` message ID, or the latest page when none is given.
      args: v.object({
        after: v.optional(v.number()),
        around: v.optional(v.string()),
        before: v.optional(v.number()),
        conversationId: v.string(),
      }),
      returns: messagePage,
    }),
    /**
     * Reactions to the given messages, gathered from every member's PDS
     * (each stores its own accounts' reactions).
     */
    reactions: defineOperation({
      args: v.object({
        conversationId: v.string(),
        messageIds: v.array(v.string()),
      }),
      returns: v.array(reaction),
    }),
    spaces: defineOperation({
      args: v.object({}),
      returns: v.array(space),
    }),
    space: defineOperation({
      args: v.object({ spaceId: v.string() }),
      returns: v.union(v.null(), space),
    }),
    /** Spaces you've been invited to and haven't answered, newest first. */
    spaceInvites: defineOperation({
      args: v.object({}),
      returns: v.array(spaceInvite),
    }),
    /**
     * A space's unexpired invite links: all of them for owners, your own
     * for members.
     */
    spaceInviteLinks: defineOperation({
      args: v.object({ spaceId: v.string() }),
      returns: v.array(spaceInviteLink),
    }),
    /** Where an invite link leads; null when it's unknown or expired. */
    spaceInviteLinkPreview: defineOperation({
      args: v.object({ code: v.string() }),
      returns: v.union(v.null(), spaceInviteLinkPreview),
    }),
  },
  requires: { accounts: DECENTRALIZED_CONVEX_VERSION },
});

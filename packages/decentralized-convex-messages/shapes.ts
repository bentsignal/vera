import type { Infer } from "convex/values";
import { v } from "convex/values";

// The values the messages operations take and return.

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

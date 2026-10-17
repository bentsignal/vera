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

/** At most this many attachments per message. */
export const MAX_ATTACHMENTS = 10;

export const linkPreview = v.object({
  description: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  siteName: v.optional(v.string()),
  title: v.optional(v.string()),
  url: v.string(),
  /**
   * A video the link's post holds (a tweet's, say), playable in the app.
   * `imageUrl` is its poster.
   */
  video: v.optional(
    v.object({
      durationMs: v.optional(v.number()),
      height: v.optional(v.number()),
      url: v.string(),
      width: v.optional(v.number()),
    }),
  ),
});

export type LinkPreview = Infer<typeof linkPreview>;

/**
 * A link in a message that gets a preview card. `link` is the URL as
 * written in the message (a preview's `url` is where it led). `preview` is
 * absent while the server fetches it and null when it couldn't, so the app
 * shows a placeholder, then the card, or a card with just the link.
 */
export const linkCard = v.object({
  link: v.string(),
  preview: v.optional(v.union(v.null(), linkPreview)),
});

export type LinkCard = Infer<typeof linkCard>;

/**
 * Someone a message @mentions: their address, and the name written after
 * the `@` in its body (their display name when it was sent). Apps bold
 * `@name` where it appears.
 */
export const mention = v.object({
  accountId: v.string(),
  name: v.string(),
});

export type Mention = Infer<typeof mention>;

/** At most this many mentions per message. */
export const MAX_MENTIONS = 50;

/**
 * What a group or channel alerts its members about: every message, only
 * ones that @mention them, or nothing (it stays out of activity and sends
 * no pushes). Direct messages are `all` or `none`.
 */
export const alertLevel = v.union(
  v.literal("all"),
  v.literal("mentions"),
  v.literal("none"),
);

export type AlertLevel = Infer<typeof alertLevel>;

/**
 * A kind of row an app's Inbox lists: direct messages and groups
 * (`chats`), channels, and threads you're in.
 */
export const inboxKind = v.union(
  v.literal("chats"),
  v.literal("channels"),
  v.literal("threads"),
);

export type InboxKind = Infer<typeof inboxKind>;

/**
 * What a reply shows of the message it answers: its author, text, and
 * first attachment, as they were when the reply was sent.
 */
export const quote = v.object({
  attachment: v.optional(attachment),
  authorId: v.string(),
  body: v.string(),
});

export type Quote = Infer<typeof quote>;

export const message = v.object({
  attachments: v.array(attachment),
  authorId: v.string(),
  authorName: v.string(),
  body: v.string(),
  conversationId: v.string(),
  /** The first link's preview, for apps from before `linkPreviews`. */
  linkPreview: v.union(v.null(), linkPreview),
  /**
   * A card for each previewed link, in order, set when the message is
   * sent (absent from PDSs that predate it, which preview only the first
   * link through `linkPreview`).
   */
  linkPreviews: v.optional(v.array(linkCard)),
  /** Who it @mentions (absent when nobody, and from older PDSs). */
  mentions: v.optional(v.array(mention)),
  messageId: v.string(),
  /** A reply's quote of the message it answers, which may be a reply. */
  quote: v.optional(quote),
  sentAt: v.number(),
  /**
   * A reply's thread: the ID of its original. Threads are flat, so this is
   * never another reply's ID.
   */
  threadId: v.optional(v.string()),
  /**
   * A reply that stays in its thread (sent there, or from an older app
   * after the thread's first): `list` leaves these out, so the
   * conversation shows only the replies sent from it.
   */
  threadOnly: v.optional(v.boolean()),
});

export type Message = Infer<typeof message>;

export const conversationKind = v.union(
  v.literal("direct"),
  v.literal("group"),
  v.literal("channel"),
);

export const conversation = v.object({
  /**
   * What it alerts the caller about, after their own choice, their
   * space's, and their defaults (absent from older PDSs: `muted` says).
   */
  alerts: v.optional(alertLevel),
  conversationId: v.string(),
  kind: conversationKind,
  lastMessage: v.union(v.null(), message),
  members: v.array(v.string()),
  /** Whether it alerts the caller about nothing (`alerts` is `none`). */
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
  /**
   * The caller's own choice for the channel; absent when it follows the
   * space's `alerts`.
   */
  alerts: v.optional(alertLevel),
  conversationId: v.string(),
  /** Whether the caller hid its alerts (absent from older PDSs: no). */
  muted: v.optional(v.boolean()),
  name: v.string(),
  position: v.number(),
  /** Whether the caller's inbox lists it (absent from older PDSs: yes). */
  showInInbox: v.optional(v.boolean()),
  unreadCount: v.number(),
});

export type Channel = Infer<typeof channel>;

export const spaceRole = v.union(v.literal("owner"), v.literal("member"));

export const space = v.object({
  /**
   * What its channels alert the caller about, unless a channel has its
   * own choice: theirs for the space, or their channels default (absent
   * from older PDSs: `muted` says).
   */
  alerts: v.optional(alertLevel),
  channels: v.array(channel),
  /** People invited who haven't accepted yet (absent from older PDSs). */
  invited: v.optional(v.array(v.string())),
  /** When the caller joined or created it (absent from older PDSs). */
  joinedAt: v.optional(v.number()),
  members: v.array(v.object({ accountId: v.string(), role: spaceRole })),
  /**
   * Whether the caller hid alerts for the whole space, every channel in it
   * (absent from older PDSs: no).
   */
  muted: v.optional(v.boolean()),
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

/**
 * One account's emoji reaction to a message. A message with several parts
 * (its text, photos, files, link previews) takes reactions on each:
 * `attachment` is the index of the attachment reacted to, `link` the index
 * of the link preview (in `linkPreviews`), and with neither, the reaction
 * is to the message itself: its text, or its first attachment when it has
 * no text, or its first link preview when its text is only links.
 */
export const reaction = v.object({
  accountId: v.string(),
  attachment: v.optional(v.number()),
  emoji: v.string(),
  link: v.optional(v.number()),
  messageId: v.string(),
  reactedAt: v.number(),
});

export type Reaction = Infer<typeof reaction>;

/**
 * Someone joining or leaving a group, which apps show between its
 * messages. `by` is who added someone who joined.
 */
export const memberEvent = v.object({
  accountId: v.string(),
  at: v.number(),
  by: v.optional(v.string()),
  eventId: v.string(),
  kind: v.union(v.literal("joined"), v.literal("left")),
});

export type MemberEvent = Infer<typeof memberEvent>;

/** `memberEvents` lists at most this many, the newest. */
export const MAX_MEMBER_EVENTS = 200;

/**
 * A message's thread as one PDS knows it: how many replies it stores and
 * who wrote the newest. Apps add up every member's PDS's summaries.
 */
export const threadSummary = v.object({
  /** When the newest reply here was sent. */
  lastReplyAt: v.number(),
  replyCount: v.number(),
  /** Who wrote the replies here, newest first, at most `MAX_REPLIERS`. */
  repliers: v.array(v.string()),
  threadId: v.string(),
});

export type ThreadSummary = Infer<typeof threadSummary>;

/** At most this many repliers per summary. */
export const MAX_REPLIERS = 5;

/** A thread's original message and one page of its replies, oldest first. */
export const threadPage = v.object({
  hasNewer: v.boolean(),
  hasOlder: v.boolean(),
  messages: v.array(message),
  /** Null from a PDS that doesn't store the original. */
  root: v.union(v.null(), message),
});

/**
 * A thread in a list of them, as one PDS knows it: its replies stored
 * there, the message it answers, and the caller's place in it. Apps add
 * up every member's PDS's listings, as with `threadSummary`.
 */
const threadListingFields = {
  conversationId: v.string(),
  /**
   * Whether the caller is in the thread with its bell on (see
   * `setThreadFollowed`). A thread whose bell they turned off isn't theirs.
   */
  following: v.boolean(),
  /** When the newest reply here was sent. */
  lastReplyAt: v.number(),
  /** How far the caller has read it; null when they aren't in it here. */
  lastReadAt: v.union(v.null(), v.number()),
  replyCount: v.number(),
  /** Who wrote the replies here, newest first, at most `MAX_REPLIERS`. */
  repliers: v.array(v.string()),
  /** The message it answers; null from a PDS that doesn't store it. */
  root: v.union(v.null(), message),
  threadId: v.string(),
  /**
   * Others' replies here after `lastReadAt`, leaving out the first (which
   * shows, and is read, in the conversation), at most `MAX_THREAD_UNREAD`.
   * Zero when the caller isn't following it.
   */
  unreadCount: v.number(),
};

export const threadListing = v.object(threadListingFields);

export type ThreadListing = Infer<typeof threadListing>;

/** A page of a conversation's threads, newest reply first. */
export const threadListingPage = v.object({
  /** Whether older threads exist beyond this page (see `threads`). */
  hasMore: v.boolean(),
  threads: v.array(threadListing),
});

/** At most this many threads per page of `threads`. */
export const THREAD_PAGE_SIZE = 30;

/** Unread replies counted per thread. */
export const MAX_THREAD_UNREAD = 99;

/** The caller's place in a thread. */
export const threadState = v.object({
  /** Whether the caller hears about new replies (the thread's bell). */
  following: v.boolean(),
  /** How far the caller has read; null before they've opened it. */
  lastReadAt: v.union(v.null(), v.number()),
});

export type ThreadState = Infer<typeof threadState>;

/**
 * How long someone shows as typing after their app last said so. Apps say
 * so again every `TYPING_REFRESH` while the text keeps changing.
 */
export const TYPING_TIMEOUT = 6_000;
/** How often an app repeats `setTyping` while its text keeps changing. */
export const TYPING_REFRESH = 3_000;

/**
 * Someone typing in a conversation (or a thread of it). `expiresIn` is
 * how long they still show as typing, from when the PDS answered: apps
 * count it down from when the answer arrived, so their clock never has to
 * agree with the PDS's. `typedAt` is the PDS's time, to compare with the
 * `sentAt` of messages stored on the same PDS.
 */
export const typist = v.object({
  accountId: v.string(),
  expiresIn: v.number(),
  /** When this bout of typing began, so apps keep typists in order. */
  startedAt: v.number(),
  typedAt: v.number(),
});

export type Typist = Infer<typeof typist>;

/** At most this many messages per `reactions` query. */
export const MAX_REACTION_MESSAGES = 100;

/** Oldest first. `hasOlder`/`hasNewer` say whether more exist beyond it. */
export const messagePage = v.object({
  hasNewer: v.boolean(),
  hasOlder: v.boolean(),
  messages: v.array(message),
});

/** What an activity item needs to name its conversation. */
export const activityConversation = v.object({
  conversationId: v.string(),
  kind: conversationKind,
  members: v.array(v.string()),
  name: v.union(v.null(), v.string()),
  spaceId: v.union(v.null(), v.string()),
  /** Channels only: the space's name. */
  spaceName: v.optional(v.string()),
});

export type ActivityConversation = Infer<typeof activityConversation>;

/** A thread the caller is in, for their inbox, with its conversation. */
export const inboxThread = v.object({
  ...threadListingFields,
  conversation: activityConversation,
  /** Its newest reply stored here. */
  latest: v.union(v.null(), message),
});

export type InboxThread = Infer<typeof inboxThread>;

/** At most this many threads in `inboxThreads`. */
export const MAX_INBOX_THREADS = 100;

/**
 * Which pushes an account gets. `enabled` off silences all of them; the
 * rest turn off one kind each. Muted conversations and spaces stay silent
 * either way.
 *
 * `groupAlerts` and `channelAlerts` are what groups and channels alert
 * about (activity and pushes) unless the conversation or space has its
 * own choice. `groups` and `channels` are whether those aren't `none`,
 * for apps from before them (absent from older PDSs).
 */
export const notificationSettings = v.object({
  channelAlerts: v.optional(alertLevel),
  channels: v.boolean(),
  directMessages: v.boolean(),
  enabled: v.boolean(),
  groupAlerts: v.optional(alertLevel),
  groups: v.boolean(),
  invites: v.boolean(),
  reactions: v.boolean(),
  // Optional so results from PDSs that predate threads still validate.
  /** Replies to the caller's own messages. */
  replies: v.optional(v.boolean()),
  /** New replies in threads the caller is in. */
  threadReplies: v.optional(v.boolean()),
});

export type NotificationSettings = Infer<typeof notificationSettings>;

/** What `setNotificationSettings` changes: any of the settings. */
export const notificationSettingsChange = v.object({
  channelAlerts: v.optional(alertLevel),
  channels: v.optional(v.boolean()),
  directMessages: v.optional(v.boolean()),
  enabled: v.optional(v.boolean()),
  groupAlerts: v.optional(alertLevel),
  groups: v.optional(v.boolean()),
  invites: v.optional(v.boolean()),
  reactions: v.optional(v.boolean()),
  replies: v.optional(v.boolean()),
  threadReplies: v.optional(v.boolean()),
});

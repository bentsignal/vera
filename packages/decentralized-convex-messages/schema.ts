import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  alertLevel,
  attachment,
  conversationKind,
  inboxKind,
  linkCard,
  linkPreview,
  mention,
  quote,
  spaceRole,
} from "./protocol.ts";

export default defineSchema({
  conversations: defineTable({
    conversationId: v.string(),
    createdBy: v.string(),
    // When anything a conversation shows last changed, before
    // `conversationChanges`; no longer written.
    changedAt: v.optional(v.number()),
    kind: conversationKind,
    name: v.optional(v.string()),
    position: v.optional(v.number()),
    spaceId: v.optional(v.string()),
    // When it was created, renamed, or last messaged before messages
    // stopped writing here; its newest message counts too (see
    // `toConversation`).
    updatedAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_space", ["spaceId"]),
  // When a conversation's reactions, edits, or deletions last changed it
  // (see `markChanged`), apart from the conversation itself, which every
  // query reads to check access and which a busy conversation would
  // otherwise rewrite many times a second. New messages aren't recorded
  // here: they're the newest message, which is read instead.
  conversationChanges: defineTable({
    changedAt: v.number(),
    conversationId: v.string(),
  }).index("by_conversation", ["conversationId"]),
  // How far each account has read each conversation, apart from its member
  // row: every message moves the sender's, and the member rows are read by
  // every query in the conversation (for its routes). Absent until first
  // read since this table was added; `members.lastReadAt` (or, in a
  // channel, joining its space) stands in until then.
  readStates: defineTable({
    accountId: v.string(),
    conversationId: v.string(),
    lastReadAt: v.number(),
  }).index("by_conversation_account", ["conversationId", "accountId"]),
  // Direct and group members, plus per-account read state and settings for
  // channels.
  members: defineTable({
    accountId: v.string(),
    // The account's own choice of alerts; absent follows its space's (for
    // a channel) or its defaults. `muted` is whether it's `none`, and rows
    // from before this have only that.
    alerts: v.optional(alertLevel),
    // When alerts were last turned back on: activity from before, while
    // muted, never shows.
    alertsSince: v.optional(v.number()),
    conversationId: v.string(),
    // A channel left out of the inbox; it still appears in its space.
    hiddenFromInbox: v.optional(v.boolean()),
    // How far it had read before `readStates`; no longer written.
    lastReadAt: v.number(),
    muted: v.boolean(),
    // When the account pinned the conversation to the top of its inbox.
    pinnedAt: v.optional(v.number()),
    role: spaceRole,
  })
    .index("by_account", ["accountId"])
    .index("by_conversation_account", ["conversationId", "accountId"]),
  // People joining (added by `by`) and leaving groups, shown between
  // their messages.
  memberEvents: defineTable({
    accountId: v.string(),
    at: v.number(),
    by: v.optional(v.string()),
    conversationId: v.string(),
    kind: v.union(v.literal("joined"), v.literal("left")),
  }).index("by_conversation_at", ["conversationId", "at"]),
  messages: defineTable({
    attachments: v.array(attachment),
    authorId: v.string(),
    authorName: v.string(),
    body: v.string(),
    conversationId: v.string(),
    // A deleted thread original kept for its replies (see `message`).
    deletedAt: v.optional(v.number()),
    editedAt: v.optional(v.number()),
    linkPreview: v.optional(linkPreview),
    linkPreviews: v.optional(v.array(linkCard)),
    mentions: v.optional(v.array(mention)),
    messageId: v.string(),
    // A reply's quote of the message it answers, its thread (the original's
    // ID), and whether it stays out of the conversation (one sent in the
    // thread). See `message` in the protocol.
    quote: v.optional(quote),
    sentAt: v.number(),
    threadId: v.optional(v.string()),
    threadOnly: v.optional(v.boolean()),
  })
    .index("by_message", ["messageId"])
    .index("by_conversation_sent", ["conversationId", "sentAt"])
    // What the conversation shows: `threadOnly` undefined.
    .index("by_chat_sent", ["conversationId", "threadOnly", "sentAt"])
    .index("by_thread_sent", ["threadId", "sentAt"])
    // Replies to an account's messages, so their activity finds them,
    // and reading a conversation sees those in it.
    .index("by_quote_author_sent", ["quote.authorId", "sentAt"])
    .index("by_quote_author_conversation_sent", [
      "quote.authorId",
      "conversationId",
      "sentAt",
    ]),
  // One per account a message @mentions, so their activity finds it.
  mentions: defineTable({
    accountId: v.string(),
    conversationId: v.string(),
    messageId: v.string(),
    sentAt: v.number(),
    // The thread of a reply kept there, which shows it instead of the
    // conversation.
    threadId: v.optional(v.string()),
  })
    .index("by_account_sent", ["accountId", "sentAt"])
    .index("by_account_conversation_sent", [
      "accountId",
      "conversationId",
      "sentAt",
    ]),
  // Each thread with replies stored here: how many, and its newest.
  threads: defineTable({
    conversationId: v.string(),
    lastReplyAt: v.number(),
    replyCount: v.number(),
    // Who wrote its replies, newest first, at most `MAX_REPLIERS`.
    repliers: v.array(v.string()),
    // The author of the message it answers, when that's stored here.
    rootAuthorId: v.optional(v.string()),
    threadId: v.string(),
  })
    .index("by_thread", ["threadId"])
    .index("by_conversation_reply", ["conversationId", "lastReplyAt"]),
  // Accounts in a thread: the original's author, everyone who replied, and
  // anyone who turned its bell on.
  threadMembers: defineTable({
    accountId: v.string(),
    conversationId: v.string(),
    // The thread's newest reply, so an account's threads list by activity.
    lastReplyAt: v.number(),
    lastReadAt: v.number(),
    // The account turned the thread's bell off.
    unfollowed: v.optional(v.boolean()),
    threadId: v.string(),
  })
    .index("by_thread_account", ["threadId", "accountId"])
    .index("by_account_reply", ["accountId", "lastReplyAt"]),
  // Link previews fetched recently, shared by everyone on this PDS, so a
  // link prefetched while typing is ready when the message is sent.
  linkPreviewCache: defineTable({
    // Deleted once this passes; a fetch that never finished is retried.
    expiresAt: v.number(),
    // Set once fetched; null when the link had no preview.
    preview: v.optional(v.union(v.null(), linkPreview)),
    url: v.string(),
  }).index("by_url", ["url"]),
  // Messages whose card for `url` waits on a fetch in flight.
  linkPreviewWaits: defineTable({
    messageId: v.string(),
    url: v.string(),
  })
    .index("by_url", ["url"])
    .index("by_message", ["messageId"]),
  // Reactions by this PDS's accounts, to messages stored on any PDS.
  reactions: defineTable({
    accountId: v.string(),
    // The attachment or link preview reacted to, by index; neither for the
    // message itself (see `reaction` in the protocol).
    attachment: v.optional(v.number()),
    conversationId: v.string(),
    emoji: v.string(),
    link: v.optional(v.number()),
    messageId: v.string(),
    // Who wrote the message, when it's stored here too, so its author's
    // activity can list reactions to it.
    messageAuthorId: v.optional(v.string()),
    reactedAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_account", ["messageId", "accountId"])
    .index("by_author_reacted", ["messageAuthorId", "reactedAt"])
    // Reactions to an account's messages in one conversation, which
    // reading it sees (see `seeConversationActivity`).
    .index("by_author_conversation_reacted", [
      "messageAuthorId",
      "conversationId",
      "reactedAt",
    ])
    // Reactions since a time, for the newest messages (see `reactions`).
    .index("by_conversation_reacted", ["conversationId", "reactedAt"]),
  // Who among this PDS's accounts is typing, one row per account and
  // conversation, left behind once it times out (see `TYPING_TIMEOUT`).
  typing: defineTable({
    accountId: v.string(),
    conversationId: v.string(),
    startedAt: v.number(),
    // Typing a reply in this thread rather than in the conversation.
    threadId: v.optional(v.string()),
    typedAt: v.number(),
  })
    .index("by_conversation", ["conversationId", "typedAt"])
    .index("by_account_conversation", ["accountId", "conversationId"]),
  // Each time an account saw an activity item (`key`) on screen, through
  // the newest activity in it then. Only the newest sighting older than a
  // day matters, so older ones are deleted.
  activitySightings: defineTable({
    accountId: v.string(),
    key: v.string(),
    seenAt: v.number(),
    through: v.number(),
  })
    .index("by_account_key", ["accountId", "key", "seenAt"])
    .index("by_account_seen", ["accountId", "seenAt"]),
  spaces: defineTable({
    createdBy: v.string(),
    name: v.string(),
    spaceId: v.string(),
  }).index("by_space", ["spaceId"]),
  spaceMembers: defineTable({
    accountId: v.string(),
    // The account's choice of alerts for the space's channels (see
    // members); absent follows its channels default.
    alerts: v.optional(alertLevel),
    // When the space's alerts were last turned back on (see members).
    alertsSince: v.optional(v.number()),
    // Alerts hidden for every channel in the space.
    muted: v.optional(v.boolean()),
    role: spaceRole,
    spaceId: v.string(),
  })
    .index("by_account", ["accountId"])
    .index("by_space_account", ["spaceId", "accountId"]),
  // People invited to a space who haven't accepted or declined yet.
  spaceInvites: defineTable({
    accountId: v.string(),
    invitedBy: v.string(),
    spaceId: v.string(),
  })
    .index("by_account", ["accountId"])
    .index("by_space_account", ["spaceId", "accountId"]),
  // Links into a space; `expiresAt` is absent on ones that never expire.
  spaceInviteLinks: defineTable({
    code: v.string(),
    createdBy: v.string(),
    expiresAt: v.optional(v.number()),
    spaceId: v.string(),
  })
    .index("by_code", ["code"])
    .index("by_space", ["spaceId"]),
  // Kinds of pushes an account turned off; absent fields are on. Default
  // alerts for groups and channels are `groupAlerts` and `channelAlerts`,
  // or else `none` where `groups` or `channels` is false, else `all`.
  notificationSettings: defineTable({
    accountId: v.string(),
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
  }).index("by_account", ["accountId"]),
  pushTokens: defineTable({
    accountId: v.string(),
    // The kinds of rows the device's Inbox lists, from apps whose Activity
    // is about you (see `registerPushToken`).
    inbox: v.optional(v.array(inboxKind)),
    // The app on this device shows threads (see `registerPushToken`).
    threads: v.optional(v.boolean()),
    token: v.string(),
  })
    .index("by_account", ["accountId"])
    .index("by_token", ["token"]),
});

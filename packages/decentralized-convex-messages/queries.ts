import { defineOperation } from "@decentralized-convex/plugin";
import { v } from "convex/values";

import { activityItem } from "./activityShapes.ts";
import {
  conversation,
  linkCard,
  memberEvent,
  messagePage,
  notificationSettings,
  reaction,
  space,
  spaceInvite,
  spaceInviteLink,
  spaceInviteLinkPreview,
  threadPage,
  threadState,
  threadSummary,
  typist,
} from "./shapes.ts";
import { threadListQueries } from "./threadOperations.ts";

/** What the Messages protocol reads (see `messagesProtocol`). */
export const queries = {
  /**
   * Your conversations. With `channels`, it also lists the channels of
   * your spaces that you haven't left out of it; without, it lists only
   * direct messages and groups (as apps before the unified inbox expect).
   */
  inbox: defineOperation({
    args: v.object({ channels: v.optional(v.boolean()) }),
    returns: v.array(conversation),
  }),
  /**
   * What happened while you were away, newest first: messages from others
   * (one item per conversation) and others' reactions to your messages
   * (one per message). With `threads`, also new replies in threads
   * you're in (one per thread); with `mentions`, each message that
   * @mentions you is its own `mention` item. With `aboutYou`, only what's
   * about you: no `messages` items (the Inbox has those), and each reply
   * to your message sent in a group or channel is its own `reply` item.
   * Each conversation shows what it alerts you about, and channels left
   * out of the inbox show only mentions and replies. An item lasts until a
   * day after you saw it (see `markActivitySeen`), and nothing older than
   * `ACTIVITY_HORIZON` shows.
   */
  activity: defineOperation({
    args: v.object({
      aboutYou: v.optional(v.boolean()),
      mentions: v.optional(v.boolean()),
      threads: v.optional(v.boolean()),
    }),
    returns: v.array(activityItem),
  }),
  /** Which pushes you get (see `setNotificationSettings`). */
  notificationSettings: defineOperation({
    args: v.object({}),
    returns: notificationSettings,
  }),
  conversation: defineOperation({
    args: v.object({ conversationId: v.string() }),
    returns: v.union(v.null(), conversation),
  }),
  list: defineOperation({
    // At most one cursor: older than `before`, newer than `after`, centered
    // on the `around` message ID, or the latest page when none is given.
    // `limit` makes a page newer than `after` smaller than
    // `MESSAGE_PAGE_SIZE`: an app following the newest messages keeps its
    // newest page small, since every message sent resends all of it.
    args: v.object({
      after: v.optional(v.number()),
      around: v.optional(v.string()),
      before: v.optional(v.number()),
      conversationId: v.string(),
      limit: v.optional(v.number()),
    }),
    returns: messagePage,
  }),
  /** A group's newest `MAX_MEMBER_EVENTS` joins and leaves, oldest first. */
  memberEvents: defineOperation({
    args: v.object({ conversationId: v.string() }),
    returns: v.array(memberEvent),
  }),
  /**
   * Reactions to the given messages, or with `since` instead, every
   * reaction made after then (at most `MAX_SINCE_RESULTS`, the newest),
   * gathered from every member's PDS (each stores its own accounts'
   * reactions). `since` covers messages still arriving with one query
   * that doesn't change as they do.
   */
  reactions: defineOperation({
    args: v.object({
      conversationId: v.string(),
      messageIds: v.optional(v.array(v.string())),
      since: v.optional(v.number()),
    }),
    returns: v.array(reaction),
  }),
  /**
   * Who else is typing in a conversation, or with `threadId`, in that
   * thread, gathered from every member's PDS (each stores its own
   * accounts' typing).
   */
  typing: defineOperation({
    args: v.object({
      conversationId: v.string(),
      threadId: v.optional(v.string()),
    }),
    returns: v.array(typist),
  }),
  /**
   * A thread: its original message and one page of replies, oldest
   * first, gathered from every member's PDS. At most one cursor: older
   * than `before`, newer than `after`, or the latest page. `limit` as in
   * `list`.
   */
  thread: defineOperation({
    args: v.object({
      after: v.optional(v.number()),
      before: v.optional(v.number()),
      conversationId: v.string(),
      limit: v.optional(v.number()),
      threadId: v.string(),
    }),
    returns: threadPage,
  }),
  /**
   * The threads of the given messages that have replies, or with `since`
   * instead, every thread replied to after then (at most
   * `MAX_SINCE_RESULTS`, the newest), from every member's PDS (each counts
   * the replies it stores).
   */
  threadSummaries: defineOperation({
    args: v.object({
      conversationId: v.string(),
      messageIds: v.optional(v.array(v.string())),
      since: v.optional(v.number()),
    }),
    returns: v.array(threadSummary),
  }),
  ...threadListQueries,
  /** Your place in a thread: its bell, and how far you've read. */
  threadState: defineOperation({
    args: v.object({ conversationId: v.string(), threadId: v.string() }),
    returns: threadState,
  }),
  /**
   * What this PDS has fetched of each link's preview so far (see
   * `prefetchLinkPreviews`), at most `MAX_LINK_PREVIEWS` links.
   */
  linkPreviews: defineOperation({
    args: v.object({ urls: v.array(v.string()) }),
    returns: v.array(linkCard),
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
};

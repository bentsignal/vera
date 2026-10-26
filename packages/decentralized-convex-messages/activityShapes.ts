import type { Infer, PropertyValidators } from "convex/values";
import { v } from "convex/values";

import { activityConversation, message, reaction, said } from "./shapes.ts";

// What `activity` lists, and how seeing it is recorded.

/**
 * When the caller last saw an activity item on screen, and the newest
 * activity it held then. Absent until they first see it.
 */
const activitySeen = {
  seenAt: v.optional(v.number()),
  seenThrough: v.optional(v.number()),
};

/**
 * An item's kinds, with `where` saying its conversation: whole, or (in a
 * `compact` list) by ID, described once in the list's `conversations`.
 */
function activityItems<Where extends PropertyValidators>(where: Where) {
  return v.union(
    v.object({
      ...activitySeen,
      at: v.number(),
      /** Who wrote them, newest first. */
      authors: v.array(v.string()),
      ...where,
      /** How many messages others sent (at most `MAX_ACTIVITY_MESSAGES`). */
      count: v.number(),
      key: v.string(),
      kind: v.literal("messages"),
      /** The newest of them. */
      latest: message,
    }),
    v.object({
      ...activitySeen,
      at: v.number(),
      ...where,
      key: v.string(),
      kind: v.literal("reactions"),
      /** The caller's message they reacted to. */
      message,
      /** Newest first. */
      reactions: v.array(reaction),
    }),
    /** Only for apps that ask for mentions (see `activity`). */
    v.object({
      ...activitySeen,
      at: v.number(),
      ...where,
      key: v.string(),
      kind: v.literal("mention"),
      /** The message that @mentions the caller. */
      message,
      /**
       * When it doesn't, the caller's name or keyword it says instead
       * (absent from older PDSs, which have only @mentions).
       */
      said: v.optional(said),
    }),
    /** Only for apps that ask for activity about you (see `activity`). */
    v.object({
      ...activitySeen,
      at: v.number(),
      ...where,
      key: v.string(),
      kind: v.literal("reply"),
      /** The reply, sent in the conversation; its `quote` is the caller's. */
      message,
    }),
    v.object({
      ...activitySeen,
      at: v.number(),
      /** Who wrote them, newest first. */
      authors: v.array(v.string()),
      ...where,
      /**
       * How many replies others sent (at most `MAX_ACTIVITY_MESSAGES`),
       * leaving out the first, which shows in the conversation.
       */
      count: v.number(),
      key: v.string(),
      kind: v.literal("thread"),
      /** The newest of them. */
      latest: message,
      /** The message the thread answers; null when this PDS doesn't have it. */
      root: v.union(v.null(), message),
      threadId: v.string(),
    }),
  );
}

/**
 * Something that happened while the caller was away, newest first in
 * `activity`. `key` names it for `markActivitySeen`, and `at` is its newest
 * activity: it's unseen while `at` is after `seenThrough`.
 */
export const activityItem = activityItems({
  conversation: activityConversation,
});

/** An item in a `compact` list: its conversation by ID. */
export const compactActivityItem = activityItems({
  conversationId: v.string(),
});

/**
 * Activity listing each conversation once, its items pointing at them,
 * for apps that ask (`compact`): an item repeated its conversation's
 * details, a channel's every member among them.
 */
export const compactActivity = v.object({
  conversations: v.array(activityConversation),
  items: v.array(compactActivityItem),
});

export type ActivityItem = Infer<typeof activityItem>;
export type CompactActivity = Infer<typeof compactActivity>;

/** An item seen on screen, through its newest activity then (`at`). */
export const activitySighting = v.object({
  key: v.string(),
  through: v.number(),
});

/** At most this many messages count toward one activity item. */
export const MAX_ACTIVITY_MESSAGES = 99;

/** At most this many items per `markActivitySeen`. */
export const MAX_ACTIVITY_SIGHTINGS = 100;

/** How long an item stays after it's seen: a day. */
export const ACTIVITY_SEEN_LIFETIME = 24 * 60 * 60 * 1000;

/** Activity older than this never shows, seen or not: a week. */
export const ACTIVITY_HORIZON = 7 * 24 * 60 * 60 * 1000;

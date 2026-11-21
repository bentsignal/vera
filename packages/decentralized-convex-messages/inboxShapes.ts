import { v } from "convex/values";

// What `inboxPage` answers (see .plans/inbox-paging.md).

/** How many conversations an inbox page lists (see `inboxPage`). */
export const INBOX_PAGE_SIZE = 50;
/** The most pinned conversations an inbox lists. */
export const MAX_PINNED = 100;
/**
 * How many unpinned conversations `inbox` and `inboxConversations` (from
 * before pages) list: the newest.
 */
export const LEGACY_INBOX_ROWS = 100;

/** One page of an inbox (see `inboxPage`). */
export const inboxPage = v.object({
  /** The page's conversations, newest first; pinned ones aren't here. */
  conversationIds: v.array(v.string()),
  /** The `before` for the next page, or null at the end. */
  next: v.union(v.null(), v.number()),
  /** The first page's: the pinned conversations, in the order pinned. */
  pinned: v.array(v.string()),
});

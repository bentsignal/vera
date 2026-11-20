import type { QueryCtx } from "./_generated/server.js";
import type { ActivityOptions } from "./activity.ts";
import type { ConversationAccess } from "./model.ts";
import type { ActivityItem, InboxKind } from "./protocol.ts";
import type { AccountSettings } from "./settings.ts";
import { activity, isUnseen } from "./activity.ts";
import { alertsFor } from "./alerts.ts";
import { hasUnread, unreadCount } from "./chatMessages.ts";
import { inboxAccess } from "./inbox.ts";
import { pendingInvites } from "./pendingInvites.ts";
import { readPosition } from "./readStates.ts";
import { notificationSettings } from "./settings.ts";
import { unreadThreadCount } from "./threadLists.ts";

/** What Home counts of one Inbox row. */
export interface RowCount {
  readonly conversationId: string;
  readonly count: number;
}

/**
 * Whether Home counts a conversation the Inbox lists with these kinds:
 * one that alerts about its every message. One at `mentions` or muted
 * keeps its unread dot without counting, and its mentions and replies to
 * you count in activity instead.
 */
export function countsRow(
  access: ConversationAccess,
  settings: AccountSettings,
  kinds: readonly InboxKind[],
) {
  const kind = access.conversation.kind === "channel" ? "channels" : "chats";
  return kinds.includes(kind) && alertsFor(access, settings) === "all";
}

/**
 * What a row Home counts adds to it: a direct message's or group's every
 * unread message, a channel's 1 if anything in it is unread.
 */
export async function rowCount(
  ctx: QueryCtx,
  access: ConversationAccess,
  accountId: string,
) {
  const { conversationId, kind } = access.conversation;
  const readAt = await readPosition(ctx, access, accountId);
  if (kind !== "channel") {
    return unreadCount(ctx, conversationId, accountId, readAt);
  }
  return (await hasUnread(ctx, conversationId, accountId, readAt)) ? 1 : 0;
}

/**
 * Home's part of the badge, counted the way the app counts its Home
 * tab's: every unread message in the direct messages and groups (`chats`)
 * the Inbox lists, one for each channel with anything unread, and (with
 * `threads`) one for each thread you're in with unread replies. Only the
 * rows `countsRow` says count; `rows` is what each of those adds.
 * `counted` are the chats counted message by message.
 */
async function homeCount(
  ctx: QueryCtx,
  accountId: string,
  kinds: readonly InboxKind[],
) {
  const settings = await notificationSettings(ctx, accountId);
  const listed = (
    await inboxAccess(ctx, accountId, kinds.includes("channels"))
  ).filter((access) => countsRow(access, settings, kinds));
  const [unread, threads] = await Promise.all([
    Promise.all(listed.map((access) => rowCount(ctx, access, accountId))),
    kinds.includes("threads") ? unreadThreadCount(ctx, accountId) : 0,
  ]);
  return {
    count: unread.reduce((sum, count) => sum + count, 0) + threads,
    counted: new Set(
      listed
        .filter(({ conversation }) => conversation.kind !== "channel")
        .map(({ conversation }) => conversation.conversationId),
    ),
    rows: listed.map(
      ({ conversation }, index): RowCount => ({
        conversationId: conversation.conversationId,
        count: unread[index] ?? 0,
      }),
    ),
  };
}

/**
 * Whether an activity item counts on its own: not a mention or reply in
 * a chat Home counts message by message (reading the conversation sees
 * it, so while it's unseen it's one of the chat's unread messages),
 * unless it's kept in a thread.
 */
function countsOnItsOwn(item: ActivityItem, counted: ReadonlySet<string>) {
  if (item.kind !== "mention" && item.kind !== "reply") return true;
  return (
    item.message.threadOnly === true ||
    !counted.has(item.conversation.conversationId)
  );
}

/**
 * The app icon badge for one account, counted the way the app counts its
 * tabs' badges: each activity item not yet seen (a conversation with new
 * messages, a message of yours with new reactions, a message that
 * @mentions you, or a thread you're in with new replies; what
 * conversations don't alert you about left out), plus each pending space
 * invitation. For an app whose Activity is about you (`inbox` given),
 * activity has no conversation items; Home's unread count instead (see
 * `homeCount`), and a mention or reply in a chat it counts message by
 * message counts once, as one of its messages.
 *
 * Only this PDS's activity and invitations are counted, and a push
 * carries only its own account's count. A device signed into several
 * accounts shows the sum once the app is open.
 */
export async function countBadge(
  ctx: QueryCtx,
  accountId: string,
  /** What the app shows (older ones can't clear the items they don't). */
  shows: ActivityOptions,
  /** The kinds of rows the app's Inbox lists, when it has a Home badge. */
  inbox?: readonly InboxKind[],
) {
  const [items, invites, home] = await Promise.all([
    // Counted, not shown, so it skips what only shows (who's in each
    // conversation).
    activity(
      ctx,
      accountId,
      { ...shows, aboutYou: inbox !== undefined },
      { counting: true },
    ),
    pendingInvites(ctx, accountId),
    inbox === undefined
      ? { count: 0, counted: new Set<string>(), rows: [] }
      : homeCount(ctx, accountId, inbox),
  ]);
  const unseen = items.filter(
    (item) => isUnseen(item) && countsOnItsOwn(item, home.counted),
  );
  return {
    count: unseen.length + invites.length + home.count,
    /** What each row Home counts adds (none without `inbox`). */
    rows: home.rows,
  };
}

/** The app icon badge for one account (see `countBadge`). */
export async function badgeCount(
  ctx: QueryCtx,
  accountId: string,
  shows: ActivityOptions,
  inbox?: readonly InboxKind[],
) {
  return (await countBadge(ctx, accountId, shows, inbox)).count;
}

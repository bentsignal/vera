import type { QueryCtx } from "./_generated/server.js";
import type { ActivityOptions } from "./activity.ts";
import type { InboxKind } from "./protocol.ts";
import { activity, isUnseen } from "./activity.ts";
import { alertsFor } from "./alerts.ts";
import { unreadCount } from "./chatMessages.ts";
import { inboxAccess } from "./inbox.ts";
import { pendingInvites } from "./model.ts";
import { readPosition } from "./readStates.ts";
import { notificationSettings } from "./settings.ts";
import { unreadThreadCount } from "./threadLists.ts";

/**
 * The Inbox rows of these kinds with something unread, counted the way
 * the app counts its Home tab's badge: direct messages and groups
 * (`chats`) and channels that alert about every message, and (with
 * `threads`) threads you're in with unread replies. A conversation at
 * `mentions` or muted keeps its unread dot without counting; its mentions
 * and replies to you count in activity instead.
 */
async function homeCount(
  ctx: QueryCtx,
  accountId: string,
  kinds: readonly InboxKind[],
) {
  const settings = await notificationSettings(ctx, accountId);
  const listed = (
    await inboxAccess(ctx, accountId, kinds.includes("channels"))
  ).filter(
    (access) =>
      kinds.includes(
        access.conversation.kind === "channel" ? "channels" : "chats",
      ) && alertsFor(access, settings) === "all",
  );
  const [unread, threads] = await Promise.all([
    Promise.all(
      listed.map(async (access) =>
        unreadCount(
          ctx,
          access.conversation.conversationId,
          accountId,
          await readPosition(ctx, access, accountId),
        ),
      ),
    ),
    kinds.includes("threads") ? unreadThreadCount(ctx, accountId) : 0,
  ]);
  return unread.filter((count) => count > 0).length + threads;
}

/**
 * The app icon badge for one account, counted the way the app counts its
 * tabs' badges: each activity item not yet seen (a conversation with new
 * messages, a message of yours with new reactions, a message that
 * @mentions you, or a thread you're in with new replies; what
 * conversations don't alert you about left out), plus each pending space
 * invitation. For an app whose Activity is about you (`inbox` given),
 * activity has no conversation items; the Inbox rows of the kinds it
 * lists that have something unread count instead (see `homeCount`).
 *
 * Only this PDS's activity and invitations are counted, and a push
 * carries only its own account's count. A device signed into several
 * accounts shows the sum once the app is open.
 */
export async function badgeCount(
  ctx: QueryCtx,
  accountId: string,
  /** What the app shows (older ones can't clear the items they don't). */
  shows: ActivityOptions,
  /** The kinds of rows the app's Inbox lists, when it has a Home badge. */
  inbox?: readonly InboxKind[],
) {
  const [items, invites, home] = await Promise.all([
    activity(ctx, accountId, { ...shows, aboutYou: inbox !== undefined }),
    pendingInvites(ctx, accountId),
    inbox === undefined ? 0 : homeCount(ctx, accountId, inbox),
  ]);
  return items.filter(isUnseen).length + invites.length + home;
}

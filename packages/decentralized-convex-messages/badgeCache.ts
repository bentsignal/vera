import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";
import type { RowCount } from "./badges.ts";
import type { ConversationAccess } from "./model.ts";
import type { InboxKind } from "./protocol.ts";
import type { AccountSettings } from "./settings.ts";
import { mentionedBy } from "./alerts.ts";
import { countsRow, rowCount } from "./badges.ts";
import { findAccess } from "./model.ts";
import { pushBadgeRow } from "./pushBadges.ts";
import { notificationSettings } from "./settings.ts";

// Every push carries its recipient's app icon badge, and counting it reads
// everything the badge counts (hundreds of documents). A burst of messages
// would count it once a message for every recipient, so a push builds on
// the count a push to the same account saved moments before, when it can
// tell exactly what its message changed:
//
// - Only a message shown in a conversation Home counts (not a reply, not
//   in a thread, not a channel's that mentions you), whose row was counted
//   then too. Its row is counted again; the rest of the badge is as saved.
//   Counting the row again, rather than adding one, is right whichever of
//   two pushes saved first, and after you read that conversation.
// - Anything else (reactions, invitations, thread replies, older apps)
//   counts afresh, and saves that count for the next.
// - The account's own changes to what the badge counts (reading, seeing,
//   answering, changing alerts) forget the saved count (`forgetBadge`).
// - A count is built on only for `BADGE_REUSE_MS` after it was counted:
//   what others change elsewhere without a push (a deleted message, say)
//   is missed at most that long, and the next push after counts afresh.
//
// Every write moves `version`, and a count is saved only if nothing was
// written since it started (`saveBadge`), so a count read before a change
// never replaces what came after.

/** How long pushes build on a counted badge before counting it again. */
export const BADGE_REUSE_MS = 2000;
/** How long a count may take to be saved once started. */
const COUNTING_MS = 30_000;
/**
 * Slack between one mutation's clock and another's: a change this soon
 * after a count stops being usable still forgets it.
 */
const CLOCK_SLACK_MS = 5000;

type Saved = Doc<"pushBadges">["counts"][number];

/** Who a badge is for, and the kind of app (see `badgeKey`). */
interface BadgeFor {
  readonly accountId: string;
  readonly inbox: readonly InboxKind[];
  readonly key: string;
}

/**
 * Whether a message changes only its own row of the badge: one from
 * someone else shown in the conversation, not a reply (Activity's too),
 * not in a thread (whose count it changes).
 */
function changesOnlyItsRow(message: Doc<"messages"> | null, accountId: string) {
  return (
    message !== null &&
    message.authorId !== accountId &&
    message.threadId === undefined &&
    message.threadOnly !== true &&
    message.quote === undefined
  );
}

/**
 * Whether Home counts the message's row now, so counting it again tells
 * what the message changed: a channel's mention of you is an Activity
 * item of its own.
 */
function countedNow(
  access: ConversationAccess | null,
  settings: AccountSettings,
  { accountId, inbox }: BadgeFor,
  message: Doc<"messages">,
): access is ConversationAccess {
  if (access === null || !countsRow(access, settings, inbox)) return false;
  return (
    access.conversation.kind !== "channel" ||
    (access.member?.hiddenFromInbox !== true &&
      !mentionedBy(message).includes(accountId))
  );
}

/**
 * The saved count after a new message, or null when it can't be told
 * exactly: the message's row counted again, the rest as saved.
 */
async function recount(
  ctx: MutationCtx,
  badge: BadgeFor,
  saved: Saved,
  messageId: string,
): Promise<Saved | null> {
  const message = await ctx.db
    .query("messages")
    .withIndex("by_message", (index) => index.eq("messageId", messageId))
    .unique();
  if (message === null || !changesOnlyItsRow(message, badge.accountId)) {
    return null;
  }
  const before = saved.rows.find(
    (row) => row.conversationId === message.conversationId,
  );
  if (before === undefined) return null;
  const [access, settings] = await Promise.all([
    findAccess(ctx, message.conversationId, badge.accountId),
    notificationSettings(ctx, badge.accountId),
  ]);
  if (!countedNow(access, settings, badge, message)) return null;
  const count = await rowCount(ctx, access, badge.accountId);
  return {
    ...saved,
    count: saved.count - before.count + count,
    rows: saved.rows.map((row) => (row === before ? { ...row, count } : row)),
  };
}

/** Until when saved counts can be built on (see `CLOCK_SLACK_MS`). */
function usableUntil(counts: readonly Saved[]) {
  return Math.max(
    0,
    ...counts.map(
      ({ countedAt }) => countedAt + BADGE_REUSE_MS + CLOCK_SLACK_MS,
    ),
  );
}

/**
 * A push's badge built on the one saved moments before (see above), or
 * when it can't be, what to save a fresh count with (`saveBadge`). Without
 * `messageId` (a push about anything else), always the latter.
 */
export async function badgeFromCache(
  ctx: MutationCtx,
  badge: BadgeFor & { messageId?: string },
): Promise<{ count: number } | { since: number; version: number }> {
  const now = Date.now();
  const row = await pushBadgeRow(ctx, badge.accountId);
  const saved = row?.counts.find(({ key }) => key === badge.key);
  if (
    row !== null &&
    saved !== undefined &&
    badge.messageId !== undefined &&
    now - saved.countedAt < BADGE_REUSE_MS
  ) {
    const updated = await recount(ctx, badge, saved, badge.messageId);
    if (updated !== null) {
      const counts = row.counts.map((each) =>
        each === saved ? updated : each,
      );
      await ctx.db.patch(row._id, {
        counts,
        liveUntil: usableUntil(counts),
        version: row.version + 1,
      });
      return { count: updated.count };
    }
  }
  // Counted afresh: until it's saved, the account's changes must move
  // `version`, so one made meanwhile keeps it from being saved.
  const liveUntil = now + COUNTING_MS + CLOCK_SLACK_MS;
  if (row === null) {
    await ctx.db.insert("pushBadges", {
      accountId: badge.accountId,
      counts: [],
      liveUntil,
      version: 0,
    });
    return { since: now, version: 0 };
  }
  if (row.liveUntil < liveUntil) await ctx.db.patch(row._id, { liveUntil });
  return { since: now, version: row.version };
}

/**
 * Saves a fresh count for the pushes after it, unless anything was
 * written since it started (`version`), or it took too long.
 */
export async function saveBadge(
  ctx: MutationCtx,
  args: Omit<BadgeFor, "inbox"> & {
    count: number;
    countedAt: number;
    rows: readonly RowCount[];
    since: number;
    version: number;
  },
) {
  const row = await pushBadgeRow(ctx, args.accountId);
  if (row?.version !== args.version) return;
  if (Date.now() > args.since + COUNTING_MS) return;
  const fresh: Saved = {
    count: args.count,
    countedAt: args.countedAt,
    key: args.key,
    rows: [...args.rows],
  };
  // Every other count being counted started before this write, so none
  // will be saved now: only the saved counts need to stay forgettable.
  const counts = [
    ...row.counts.filter(
      ({ countedAt, key }) =>
        key !== args.key && Date.now() - countedAt < BADGE_REUSE_MS,
    ),
    fresh,
  ];
  await ctx.db.patch(row._id, {
    counts,
    liveUntil: usableUntil(counts),
    version: row.version + 1,
  });
}

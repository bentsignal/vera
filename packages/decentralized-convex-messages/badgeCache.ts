import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { ConversationAccess } from "./model.ts";
import type { InboxKind } from "./protocol.ts";
import type { AccountSettings } from "./settings.ts";
import { mentionedBy } from "./alerts.ts";
import { countBadge, countsRow, rowCount } from "./badges.ts";
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
// The reading is a query (`badgeFor`), so it never conflicts with the
// sends it reads; a small mutation then saves what it found
// (`settleBadge`), only if the saved row is the version the query read.
// Every write moves `version`, so a count read before a change never
// replaces what came after. The account's changes write only for
// `LIVE_MS` after a push (`liveUntil`), so a push to an account that
// had none just before counts afresh without saving (a change made while
// it counted wouldn't have moved `version`), and the next push's count
// is saved.

/** How long pushes build on a counted badge before counting it again. */
export const BADGE_REUSE_MS = 2000;
/** How long after a push the account's changes are forgotten. */
const LIVE_MS = 10_000;
/**
 * Slack between one function's clock and another's: a count is saved
 * only this long before the account's changes stop being forgotten.
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
  ctx: QueryCtx,
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

/** What `badgeFor` found, for `settleBadge`. */
export interface Settle {
  readonly entry: Saved;
  /** Counted afresh, rather than built on the saved count. */
  readonly fresh: boolean;
  /** Whether the account's changes were being forgotten when it read. */
  readonly live: boolean;
  /** The saved row's version it read; null when there was none. */
  readonly version: number | null;
}

/**
 * A push's badge, built on the one saved moments before when it can be
 * (see above), otherwise counted afresh; and what to settle it with.
 * Without `messageId` (a push about anything else), always afresh.
 */
export async function badgeFor(
  ctx: QueryCtx,
  badge: BadgeFor & { messageId?: string; threads: boolean },
): Promise<{ count: number; settle: Settle }> {
  const now = Date.now();
  const row = await pushBadgeRow(ctx, badge.accountId);
  const version = row?.version ?? null;
  const saved = row?.counts.find(({ key }) => key === badge.key);
  if (
    saved !== undefined &&
    badge.messageId !== undefined &&
    now - saved.countedAt < BADGE_REUSE_MS
  ) {
    const entry = await recount(ctx, badge, saved, badge.messageId);
    if (entry !== null) {
      const settle = { entry, fresh: false, live: true, version };
      return { count: entry.count, settle };
    }
  }
  const counted = await countBadge(
    ctx,
    badge.accountId,
    { mentions: true, threads: badge.threads },
    badge.inbox,
  );
  const entry = {
    count: counted.count,
    countedAt: now,
    key: badge.key,
    rows: counted.rows,
  };
  // Live long enough for `settleBadge` to save it.
  const live = row !== null && row.liveUntil > now + CLOCK_SLACK_MS;
  return {
    count: counted.count,
    settle: { entry, fresh: true, live, version },
  };
}

/**
 * Saves what `badgeFor` found for the pushes after it, unless the saved
 * row changed since it read it, and forgets the account's changes for
 * `LIVE_MS` from now. A badge built on the saved count is right only if
 * this saves it (true); one counted afresh is right either way.
 */
export async function settleBadge(
  ctx: MutationCtx,
  accountId: string,
  { entry, fresh, live, version }: Settle,
) {
  const now = Date.now();
  const row = await pushBadgeRow(ctx, accountId);
  const liveUntil = now + LIVE_MS;
  // Only while the account's changes were being forgotten from when the
  // query read until now (with slack for clocks) did each change since
  // move `version`.
  const unchanged =
    live &&
    row !== null &&
    row.version === version &&
    now <= row.liveUntil - CLOCK_SLACK_MS;
  if (!unchanged) {
    if (row === null) {
      await ctx.db.insert("pushBadges", {
        accountId,
        counts: [],
        liveUntil,
        version: 0,
      });
    } else if (fresh && row.liveUntil < liveUntil) {
      await ctx.db.patch(row._id, { liveUntil });
    }
    return false;
  }
  await ctx.db.patch(row._id, {
    counts: [
      ...row.counts.filter(
        ({ countedAt, key }) =>
          key !== entry.key && now - countedAt < BADGE_REUSE_MS,
      ),
      entry,
    ],
    liveUntil: Math.max(row.liveUntil, liveUntil),
    version: row.version + 1,
  });
  return true;
}

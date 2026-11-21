import type { MutationCtx } from "./_generated/server.js";
import { activity, isUnseen } from "./activity.ts";
import { accessFinder, isHeard } from "./activityScope.ts";
import { alertsFor } from "./alerts.ts";
import { listedAccess } from "./inboxPages.ts";
import { INBOX_PAGE_SIZE } from "./protocol.ts";
import { forgetBadge } from "./pushBadges.ts";
import { markReadUpTo } from "./readStates.ts";
import { notificationSettings } from "./settings.ts";
import { recordSighting } from "./sightings.ts";
import { spaceReads } from "./spaceReads.ts";

/** Thread memberships looked at, newest first, as the badge does. */
const MAX_THREADS_CLEARED = 500;

/**
 * Marks read, through now, everything the badge counts for any app (see
 * `countBadge`): the conversations it counts that alert about every
 * message, the threads you follow in conversations you hear from, and
 * every Activity item not yet seen (whatever it's about, so what an older
 * app counts goes too). Pending space invitations aren't something to
 * read, so they still count until answered.
 */
export async function clearBadge(ctx: MutationCtx, self: string) {
  await forgetBadge(ctx, self);
  const now = Date.now();
  const spaces = spaceReads(ctx);
  const settings = await notificationSettings(ctx, self);
  const listed = await listedAccess(
    ctx,
    self,
    { channels: true, limit: INBOX_PAGE_SIZE },
    spaces,
  );
  for (const access of listed) {
    if (alertsFor(access, settings) !== "all") continue;
    await markReadUpTo(ctx, access, self, now);
  }

  const accessTo = accessFinder(ctx, self, spaces);
  const memberships = await ctx.db
    .query("threadMembers")
    .withIndex("by_account_reply", (index) => index.eq("accountId", self))
    .order("desc")
    .take(MAX_THREADS_CLEARED);
  for (const member of memberships) {
    if (member.unfollowed === true || member.lastReplyAt <= member.lastReadAt) {
      continue;
    }
    const access = await accessTo(member.conversationId);
    if (access === null || !isHeard(access, alertsFor(access, settings))) {
      continue;
    }
    await ctx.db.patch(member._id, { lastReadAt: now });
  }

  const shows = { mentions: true, threads: true };
  const [aboutYou, older] = await Promise.all([
    activity(ctx, self, { ...shows, aboutYou: true }, { counting: true }),
    activity(ctx, self, shows, { counting: true }),
  ]);
  const unseen = new Map(
    [...aboutYou, ...older]
      .filter(isUnseen)
      .map((item) => [item.key, item.at] as const),
  );
  for (const [key, through] of unseen) {
    await recordSighting(ctx, self, { key, now, through });
  }
  return null;
}

import type { MutationCtx, QueryCtx } from "./_generated/server.js";

// The badge counts pushes save for the pushes right after (see
// badgeCache.ts), and forgetting them when the account changes what they
// count. Small, since every mutation that changes what they count
// imports it.

/** The account's saved badge counts, if any. */
export function pushBadgeRow(ctx: QueryCtx, accountId: string) {
  return ctx.db
    .query("pushBadges")
    .withIndex("by_account", (index) => index.eq("accountId", accountId))
    .unique();
}

/**
 * Forgets the account's saved badge counts after it changed what they
 * count (read something, saw it, answered an invitation, changed what
 * alerts it), so no push builds on them, and no count read before the
 * change is saved. Writes only for a few seconds after a push to the
 * account (`liveUntil`), so most changes read one document and write
 * nothing.
 */
export async function forgetBadge(ctx: MutationCtx, accountId: string) {
  const row = await pushBadgeRow(ctx, accountId);
  if (row === null || row.liveUntil <= Date.now()) return;
  await ctx.db.patch(row._id, {
    counts: [],
    liveUntil: 0,
    version: row.version + 1,
  });
}

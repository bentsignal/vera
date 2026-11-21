import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { claimFetches, fetchableUrls, isFresh } from "./linkCache.ts";

// How many link previews one account can have the server fetch ahead of a
// send (`prefetchLinkPreviews`), so a script can't make it fetch pages
// endlessly. A token bucket per account, counting fetches started: links
// already cached cost nothing. Typing a message with a link or two starts a
// handful, well inside it.

/** Fetches someone can start at once. */
export const PREFETCH_BURST = 20;
/** How long one fetch takes to come back. */
export const PREFETCH_REFILL_MS = 3000;

function bucketOf(ctx: Pick<QueryCtx, "db">, accountId: string) {
  return ctx.db
    .query("prefetchLimits")
    .withIndex("by_account", (index) => index.eq("accountId", accountId))
    .unique();
}

/** Fetches left in a bucket last written at `updatedAt`, refilled since. */
export function prefetchesLeft(
  bucket: { tokens: number; updatedAt: number } | null,
  now: number,
) {
  if (bucket === null) return PREFETCH_BURST;
  return Math.min(
    PREFETCH_BURST,
    bucket.tokens + Math.max(0, now - bucket.updatedAt) / PREFETCH_REFILL_MS,
  );
}

/**
 * Claims fetches for the links someone is typing (see `claimFetches`), as
 * many as their allowance has left. The rest wait for the send, which
 * fetches what's missing.
 */
export async function claimPrefetches(
  ctx: MutationCtx,
  accountId: string,
  urls: readonly string[],
  now: number,
) {
  const wanted: string[] = [];
  for (const url of fetchableUrls(urls)) {
    if (!(await isFresh(ctx, url, now))) wanted.push(url);
  }
  if (wanted.length === 0) return [];
  const stored = await bucketOf(ctx, accountId);
  const left = prefetchesLeft(stored, now);
  const allowed = wanted.slice(0, Math.floor(left));
  if (allowed.length === 0) return [];
  const bucket = { accountId, tokens: left - allowed.length, updatedAt: now };
  if (stored === null) await ctx.db.insert("prefetchLimits", bucket);
  else await ctx.db.replace(stored._id, bucket);
  return claimFetches(ctx, allowed, now);
}

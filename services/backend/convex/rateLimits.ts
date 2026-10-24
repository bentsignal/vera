import { v } from "convex/values";

import type { AssistantName } from "../assistant-limits";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { current, decide, STRIKES_PER_DAY } from "../assistant-limits";
import { internalMutation, internalQuery } from "./_generated/server";
import { botName } from "./schema";

// How fast one person can use each of Vera's assistants, counted
// separately per assistant (`LIMITS` in assistant-limits.ts):
//
// - 300 replies an hour from each, counted separately. Rolling: a token
//   bucket per person and assistant that holds an hour's replies and
//   refills one every 12 seconds.
// - Each separate time they run the hour's allowance dry is a strike. Five
//   strikes within a day (a fixed window from the first) pause that
//   assistant for them until the day is up, so someone can't sit at the
//   limit sending a message every refill.
//
// Over a limit, the assistant says so once, without the model. (Convex's
// rate limiter Component can't be installed here: it installs a Component of
// its own, which breaks importing convex.config.ts outside Convex, as
// http.ts and pds.ts do.)

interface Key {
  accountId: string;
  bot: AssistantName;
}

function bucketOf(ctx: Pick<QueryCtx, "db">, { accountId, bot }: Key) {
  return ctx.db
    .query("rateLimits")
    .withIndex("by_account", (q) => q.eq("accountId", accountId).eq("bot", bot))
    .unique();
}

/**
 * Takes one reply from the person's allowance: `{ ok: true }`, or a refusal
 * with the notice to send (null when they've already been told).
 */
export async function takeReply(ctx: MutationCtx, key: Key) {
  const now = Date.now();
  const stored = await bucketOf(ctx, key);
  const bucket = current(stored, key, now);
  const result = decide(bucket, now);
  if (stored === null) await ctx.db.insert("rateLimits", result.bucket);
  else await ctx.db.replace(stored._id, result.bucket);
  return result.ok
    ? { ok: true as const }
    : { notice: result.notice, ok: false as const };
}

/**
 * Operator command:
 * `npx convex run rateLimits:status '{"accountId":"someone@vera.chat","bot":"vera"}'`.
 */
export const status = internalQuery({
  args: { accountId: v.string(), bot: botName },
  handler: async (ctx, key) => {
    const bucket = current(await bucketOf(ctx, key), key, Date.now());
    return {
      paused: (bucket.strikes ?? 0) >= STRIKES_PER_DAY,
      repliesLeft: Math.floor(bucket.tokens),
      strikesToday: bucket.strikes ?? 0,
    };
  },
});

/**
 * Operator command:
 * `npx convex run rateLimits:reset '{"accountId":"someone@vera.chat"}'`.
 * Gives someone their full hour back and clears today's strikes, with
 * every assistant.
 */
export const reset = internalMutation({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }) => {
    const buckets = await ctx.db
      .query("rateLimits")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();
    await Promise.all(buckets.map((bucket) => ctx.db.delete(bucket._id)));
  },
});

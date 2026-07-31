import { v } from "convex/values";

import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { internalQuery } from "../../_generated/server";
import { authedQuery } from "../../convex_helpers";
import { authorizeAccess, getMetadata } from "./helpers";

/**
 * A thread's "state" is just the latest row in `threadEvents` for the thread.
 * `null` means no events → the thread is idle. Callers interpret event types
 * directly (`user_message_sent`, `agent_working`, `response_streaming`); no
 * intermediate vocabulary. Steady-state idle = 0 rows for the thread.
 */
export async function getLatestEvent(ctx: QueryCtx, threadId: Id<"threads">) {
  const event = await ctx.db
    .query("threadEvents")
    .withIndex("threadId_timestamp", (q) => q.eq("threadId", threadId))
    .order("desc")
    .first();
  return event?.eventType ?? null;
}

export const get = authedQuery({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const { threadId } = args;
    if (threadId.trim().length === 0) return null;
    const thread = await authorizeAccess(ctx, threadId);
    if (!thread) return null;
    return getLatestEvent(ctx, thread._id);
  },
});

/**
 * "Did the user abort this generation?" — true iff the generation's events
 * have been cleared (abort path calls `clearEventsForGeneration`). Safe to
 * call after natural completion too: completion also clears events, but the
 * caller decides what to do with the answer in each code path.
 */
export const wasAborted = internalQuery({
  args: { threadId: v.string(), generationId: v.string() },
  handler: async (ctx, args) => {
    const thread = await getMetadata(ctx, args.threadId);
    if (!thread) return true;
    const event = await ctx.db
      .query("threadEvents")
      .withIndex("generationId", (q) => q.eq("generationId", args.generationId))
      .first();
    return event === null;
  },
});

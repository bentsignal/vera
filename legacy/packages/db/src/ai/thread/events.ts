import { v } from "convex/values";

import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { EventType } from "../../agent/validators";
import { internalMutation } from "../../_generated/server";
import { vEventType } from "../../agent/validators";

export function generateGenerationId() {
  return crypto.randomUUID();
}

/**
 * Returns the active generation's id if the thread's most recent event is
 * present (either `user_message_sent` waiting-state or `streaming_started`
 * streaming-state). Returns null when the thread has no in-flight events —
 * i.e. when the thread is idle from the event log's perspective.
 */
export async function getActiveGenerationId(
  ctx: QueryCtx,
  threadId: Id<"threads">,
) {
  const event = await ctx.db
    .query("threadEvents")
    .withIndex("threadId_timestamp", (q) => q.eq("threadId", threadId))
    .order("desc")
    .first();
  return event ? event.generationId : null;
}

interface EmitArgs {
  threadId: Id<"threads">;
  userId: string | undefined;
  eventType: EventType;
  generationId: string;
}

/**
 * Insert a thread event. `user_message_sent` clears any stragglers for the
 * thread first (steady-state idle = 0 rows, so this is usually a no-op).
 * Follow-up events (`agent_working`, `response_streaming`) only insert if a
 * row already exists for this `generationId`, i.e. the cycle hasn't been
 * cleared by an abort or completion. Without that guard, an emit landing
 * after `clearEventsForGeneration` would leave a stranded row.
 */
export async function emitThreadEvent(ctx: MutationCtx, args: EmitArgs) {
  const { threadId, userId, eventType, generationId } = args;

  if (eventType === "user_message_sent") {
    const stragglers = await ctx.db
      .query("threadEvents")
      .withIndex("threadId_timestamp", (q) => q.eq("threadId", threadId))
      .collect();
    for (const ev of stragglers) {
      await ctx.db.delete(ev._id);
    }
  } else {
    const cycleStillActive = await ctx.db
      .query("threadEvents")
      .withIndex("generationId", (q) => q.eq("generationId", generationId))
      .first();
    if (!cycleStillActive) return;
  }

  await ctx.db.insert("threadEvents", {
    userId,
    threadId,
    timestamp: Date.now(),
    eventType,
    generationId,
  });
}

/**
 * Delete every event for a generation cycle. Called on terminal transitions
 * — natural completion, error, or abort — so the in-flight event log drains
 * back to zero rows for the thread. Idempotent: safe under the
 * abort-vs-complete race where both paths may call this.
 */
export async function clearEventsForGeneration(
  ctx: MutationCtx,
  generationId: string,
) {
  const events = await ctx.db
    .query("threadEvents")
    .withIndex("generationId", (q) => q.eq("generationId", generationId))
    .collect();
  for (const ev of events) {
    await ctx.db.delete(ev._id);
  }
}

export const emit = internalMutation({
  args: {
    threadId: v.string(),
    userId: v.optional(v.string()),
    eventType: vEventType,
    generationId: v.string(),
  },
  handler: async (ctx, args) => {
    const threadId = ctx.db.normalizeId("threads", args.threadId);
    if (!threadId) return;
    await emitThreadEvent(ctx, {
      threadId,
      userId: args.userId,
      eventType: args.eventType,
      generationId: args.generationId,
    });
  },
});

export const clearForGeneration = internalMutation({
  args: { generationId: v.string() },
  handler: async (ctx, args) => {
    await clearEventsForGeneration(ctx, args.generationId);
  },
});

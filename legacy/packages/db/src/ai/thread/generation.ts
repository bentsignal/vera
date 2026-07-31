import { ConvexError, v } from "convex/values";

import { abortById } from "../../agent/handlers/streams";
import { authedMutation } from "../../convex_helpers";
import { NoticeCode } from "../stream/notice_codes";
import { clearEventsForGeneration, getActiveGenerationId } from "./events";
import { authorizeAccess, logSystemNotice } from "./helpers";

export const abort = authedMutation({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await authorizeAccess(ctx, args.threadId);
    if (!thread) {
      throw new ConvexError("Thread not found");
    }
    // If the scheduled streamResponse hasn't started yet, cancel it so it
    // never calls the LLM — zero cost, no stream.init/consume error written
    // afterward.
    if (thread.generationFnId) {
      const fn = await ctx.db.system.get(thread.generationFnId);
      if (fn?.state.kind === "pending") {
        await ctx.scheduler.cancel(thread.generationFnId);
      }
    }
    const streams = await ctx.db
      .query("streamingMessages")
      .withIndex("threadId_state_order_stepOrder", (q) =>
        q.eq("threadId", thread._id).eq("state.kind", "streaming"),
      )
      .take(100);
    for (const s of streams) {
      await abortById(ctx, { streamId: s._id, reason: "user-aborted" });
    }
    const activeGenerationId = await getActiveGenerationId(ctx, thread._id);
    if (activeGenerationId) {
      await clearEventsForGeneration(ctx, activeGenerationId);
      await logSystemNotice(ctx, thread._id, NoticeCode.UserAborted);
    }
    await ctx.db.patch(thread._id, {
      generationFnId: undefined,
    });
  },
});

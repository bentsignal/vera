import { ConvexError, v } from "convex/values";

import { internalMutation } from "../../_generated/server";
import { authedQuery } from "../../convex_helpers";
import { authorizeAccess, getMetadata } from "./helpers";

export const get = authedQuery({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await authorizeAccess(ctx, args.threadId);
    if (!thread) {
      return [];
    }
    return thread.followUpQuestions ?? [];
  },
});

export const save = internalMutation({
  args: {
    threadId: v.string(),
    followUpQuestions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { threadId, followUpQuestions } = args;
    const thread = await getMetadata(ctx, threadId);
    if (!thread) {
      throw new ConvexError("Thread not found");
    }
    await ctx.db.patch(thread._id, { followUpQuestions });
  },
});

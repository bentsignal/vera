import { ConvexError, v } from "convex/values";

import { authedMutation } from "../../convex_helpers";
import { authorizeAccess } from "./helpers";

export const toggle = authedMutation({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await authorizeAccess(ctx, args.threadId);
    if (!thread) {
      throw new ConvexError("Thread not found");
    }
    await ctx.db.patch(thread._id, {
      pinned: !(thread.pinned ?? false),
    });
  },
});

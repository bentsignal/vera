import type { Infer } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { vThreadListEntry } from "./shared";
import { authedQuery } from "../../convex_helpers";
import { vThreadListReturn } from "./shared";
import { getLatestEvent } from "./state";

export const get = authedQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.string(),
  },
  returns: vThreadListReturn,
  // Route the page entries through a variable pinned to the entry
  // validator's type so the client-facing shape becomes `{ id: string; ... }`
  // instead of `{ id: Id<"threads">; ... }`. Optimistic updates need to
  // insert rows keyed by clientId (a plain string) before the server has
  // assigned a real `_id`.
  handler: async (ctx, args) => {
    const { paginationOpts, search } = args;
    const threads =
      search.trim().length > 0
        ? await ctx.db
            .query("threads")
            .withSearchIndex("title", (q) =>
              q.search("title", search).eq("userId", ctx.user.subject),
            )
            .paginate(paginationOpts)
        : await ctx.db
            .query("threads")
            .withIndex("by_user_time", (q) => q.eq("userId", ctx.user.subject))
            .order("desc")
            .paginate(paginationOpts);
    const page = await Promise.all(
      threads.page.map(
        async (thread): Promise<Infer<typeof vThreadListEntry>> => ({
          id: thread._id,
          clientId: thread.clientId,
          updatedAt: thread.updatedAt ?? thread._creationTime,
          title: thread.title ?? "",
          latestEvent: await getLatestEvent(ctx, thread._id),
          pinned: thread.pinned ?? false,
        }),
      ),
    );
    return {
      ...threads,
      page,
    };
  },
});

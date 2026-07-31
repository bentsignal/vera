import { z } from "zod";

import { createTool } from "../../../agent/tools";
import { tryCatch } from "../../../lib/utils";
import { formatSearchResults, logXApiCost, searchRecentPosts } from "./helpers";

export const searchXPosts = createTool({
  description: `
  Search for posts on X (formerly Twitter) from the last 7 days.

  Supports the full X search query syntax including operators:
  - from:username — posts from a specific user
  - to:username — replies to a specific user
  - #hashtag — posts with a specific hashtag
  - "exact phrase" — exact phrase match
  - has:media, has:images, has:links — filter by content type
  - lang:en — filter by language (BCP 47 codes)
  - is:reply, is:retweet, is:quote — filter by post type
  - -keyword — exclude a keyword
  - Combine operators with spaces (AND) or OR

  Returns a list of posts with author info, text, engagement metrics, and URLs.

  IMPORTANT: Always use the smallest max_results that satisfies the request. The
  X API charges per post read, so fewer results = lower cost. Default to 10 and
  only increase if the user explicitly asks for more.
  `,
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .max(512)
      .describe(
        "Search query using X search syntax. Can include operators like from:, #hashtag, has:media, lang:, etc.",
      ),
    max_results: z
      .number()
      .min(10)
      .max(20)
      .default(10)
      .describe(
        "Number of posts to return (10-20). Keep low to minimize API cost.",
      ),
  }),
  execute: async (ctx, args) => {
    const { data, error } = await tryCatch(
      searchRecentPosts(args.query, args.max_results),
    );
    if (error) {
      console.error("Error searching X posts", error);
      return null;
    }

    if (ctx.userId) {
      await logXApiCost(
        ctx,
        {
          posts: Math.max(data.data?.length ?? 0, 1),
          users: data.includes?.users?.length ?? 0,
        },
        ctx.userId,
      );
    }

    return formatSearchResults(data);
  },
});

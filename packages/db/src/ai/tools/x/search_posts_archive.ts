import { z } from "zod";

import { createTool } from "../../../agent/tools";
import { tryCatch } from "../../../lib/utils";
import { formatSearchResults, logXApiCost, searchAllPosts } from "./helpers";

export const searchXPostsArchive = createTool({
  description: `
  Search the full historical archive of posts on X (formerly Twitter), going back
  to March 2006. Use this when the user is looking for old posts or posts outside
  the last 7 days.

  Supports the same query syntax as the recent search tool:
  - from:username — posts from a specific user
  - to:username — replies to a specific user
  - #hashtag — posts with a specific hashtag
  - "exact phrase" — exact phrase match
  - has:media, has:images, has:links — filter by content type
  - lang:en — filter by language (BCP 47 codes)
  - is:reply, is:retweet, is:quote — filter by post type
  - -keyword — exclude a keyword

  Optionally filter by date range using start_time and end_time in ISO 8601 format.

  Returns a list of posts with author info, text, engagement metrics, and URLs.

  IMPORTANT: Always use the smallest max_results that satisfies the request. The
  X API charges per post read, so fewer results = lower cost. Default to 10 and
  only increase if the user explicitly asks for more.
  `,
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .max(1024)
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
    start_time: z
      .string()
      .optional()
      .describe(
        "Start of time range in ISO 8601 format (e.g. 2023-01-01T00:00:00Z). Only posts after this time are returned.",
      ),
    end_time: z
      .string()
      .optional()
      .describe(
        "End of time range in ISO 8601 format (e.g. 2024-06-01T00:00:00Z). Only posts before this time are returned.",
      ),
  }),
  execute: async (ctx, args) => {
    const { data, error } = await tryCatch(
      searchAllPosts(
        args.query,
        args.max_results,
        args.start_time,
        args.end_time,
      ),
    );
    if (error) {
      console.error("Error searching X post archive", error);
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

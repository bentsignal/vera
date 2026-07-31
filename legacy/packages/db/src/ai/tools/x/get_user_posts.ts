import { z } from "zod";

import { createTool } from "../../../agent/tools";
import { tryCatch } from "../../../lib/utils";
import {
  formatSearchResults,
  getUserTimeline,
  logXApiCost,
  lookupUser,
} from "./helpers";

export const getXUserPosts = createTool({
  description: `
  Get recent posts from a specific user on X (formerly Twitter).

  Provide the username (handle) of the user. The tool resolves the username to
  a user ID automatically.

  You can optionally exclude retweets and/or replies to only see the user's
  original posts.

  Returns a list of posts with text, engagement metrics, and URLs.

  IMPORTANT: Always use the smallest max_results that satisfies the request. The
  X API charges per post read, so fewer results = lower cost. Default to 10 and
  only increase if the user explicitly asks for more.
  `,
  inputSchema: z.object({
    username: z
      .string()
      .min(1)
      .max(20)
      .describe("The X username/handle without the @ symbol"),
    max_results: z
      .number()
      .min(5)
      .max(20)
      .default(10)
      .describe(
        "Number of posts to return (5-20). Keep low to minimize API cost.",
      ),
    exclude_retweets: z
      .boolean()
      .default(true)
      .describe("Whether to exclude retweets from results"),
    exclude_replies: z
      .boolean()
      .default(false)
      .describe("Whether to exclude replies from results"),
  }),
  execute: async (ctx, args) => {
    const username = args.username.replace(/^@/, "");

    const { data: userResult, error: userError } = await tryCatch(
      lookupUser(username),
    );
    if (userError) {
      console.error("Error looking up X user for timeline", userError);
      return null;
    }

    const { data, error } = await tryCatch(
      getUserTimeline(
        userResult.data.id,
        args.max_results,
        args.exclude_retweets,
        args.exclude_replies,
      ),
    );
    if (error) {
      console.error("Error fetching X user timeline", error);
      return null;
    }

    if (ctx.userId) {
      await logXApiCost(
        ctx,
        {
          posts: data.data?.length ?? 0,
          users: 1,
        },
        ctx.userId,
      );
    }

    return {
      user: {
        name: userResult.data.name,
        username: userResult.data.username,
        profile_url: `https://x.com/${userResult.data.username}`,
      },
      ...formatSearchResults(data),
    };
  },
});

import { z } from "zod";

import { createTool } from "../../../agent/tools";
import { tryCatch } from "../../../lib/utils";
import { formatTweetResult, logXApiCost, lookupPost } from "./helpers";

export const lookupXPost = createTool({
  description: `
  Look up a specific post on X (formerly Twitter) by its ID or URL. Use this when
  the user shares an X post URL or references a specific post ID and wants details
  about it.

  Accepts either a numeric post ID or a full X URL like
  https://x.com/username/status/1234567890.

  Returns the post text, author info, engagement metrics, and creation time.
  `,
  inputSchema: z.object({
    post_id: z
      .string()
      .min(1)
      .describe(
        "The numeric post ID, or a full X/Twitter URL (the ID will be extracted automatically)",
      ),
  }),
  execute: async (ctx, args) => {
    const id = extractPostId(args.post_id);

    const { data, error } = await tryCatch(lookupPost(id));
    if (error) {
      console.error("Error looking up X post", error);
      return null;
    }

    if (ctx.userId) {
      await logXApiCost(ctx, { posts: 1 }, ctx.userId);
    }

    return formatTweetResult(data);
  },
});

function extractPostId(input: string) {
  const urlMatch = /\/status\/(\d+)/.exec(input);
  if (urlMatch?.[1]) return urlMatch[1];
  return input;
}

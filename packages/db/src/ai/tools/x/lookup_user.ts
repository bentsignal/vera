import { z } from "zod";

import { createTool } from "../../../agent/tools";
import { tryCatch } from "../../../lib/utils";
import { logXApiCost, lookupUser } from "./helpers";

export const lookupXUser = createTool({
  description: `
  Look up a user profile on X (formerly Twitter) by their username/handle.

  Returns the user's display name, bio/description, profile image, follower and
  following counts, post count, location, website URL, and verification status.

  Use this when the user asks about a specific X account or when you need to
  resolve a username to a user ID (required for the user timeline tool).
  `,
  inputSchema: z.object({
    username: z
      .string()
      .min(1)
      .max(15)
      .describe(
        "The X username/handle without the @ symbol (e.g. 'elonmusk' not '@elonmusk')",
      ),
  }),
  execute: async (ctx, args) => {
    const username = args.username.replace(/^@/, "");

    const { data, error } = await tryCatch(lookupUser(username));
    if (error) {
      console.error("Error looking up X user", error);
      return null;
    }

    if (ctx.userId) {
      await logXApiCost(ctx, { users: 1 }, ctx.userId);
    }

    const user = data.data;
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      description: user.description,
      profile_image_url: user.profile_image_url,
      metrics: user.public_metrics,
      location: user.location,
      url: user.url,
      verified: user.verified,
      verified_type: user.verified_type,
      created_at: user.created_at,
      profile_url: `https://x.com/${user.username}`,
    };
  },
});

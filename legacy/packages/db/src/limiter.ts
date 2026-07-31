import type { CustomCtx } from "convex-helpers/server/customFunctions";
import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";

import type { authedMutation } from "./convex_helpers";
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";

export const limiter = new RateLimiter(components.rateLimiter, {
  messageSend: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 3 },
  transcription: {
    kind: "token bucket",
    rate: 6,
    period: MINUTE,
    capacity: 3,
  },
  suggestion: {
    kind: "token bucket",
    rate: 6,
    period: MINUTE,
    capacity: 3,
  },
  upload: {
    kind: "token bucket",
    rate: 6,
    period: MINUTE,
    capacity: 3,
  },
});

export async function messageSendRateLimit(
  ctx: CustomCtx<typeof authedMutation>,
) {
  const userId = ctx.user.subject;
  const { ok } = await limiter.limit(ctx, "messageSend", {
    key: userId,
  });
  if (!ok)
    throw new ConvexError(
      `Sending messages too fast, please wait a few seconds`,
    );
}

export const transcriptionRateLimit = mutation({
  handler: async (ctx) => {
    const userId = await ctx.auth.getUserIdentity();
    if (!userId) {
      throw new Error("Unauthorized");
    }
    const { ok } = await limiter.limit(ctx, "transcription", {
      key: userId.subject,
    });
    return ok;
  },
});

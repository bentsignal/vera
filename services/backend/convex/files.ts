import { ConvexError, v } from "convex/values";

import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";

// Uploads go to Convex file storage until the bunny.net provider is
// configured (see .plans/messaging-v1.md). Messages only store the public
// URL, so switching providers does not touch message data.

async function requireAccount(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError({ code: "AUTHENTICATED_ACCOUNT_REQUIRED" });
  }
  return identity;
}

/** Returns a one-time URL the app uploads one file to with a POST. */
export const createUpload = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAccount(ctx);
    return {
      method: "POST" as const,
      url: await ctx.storage.generateUploadUrl(),
    };
  },
});

/** Turns a finished upload into the public URL a message attaches. */
export const completeUpload = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await requireAccount(ctx);
    const url = await ctx.storage.getUrl(storageId);
    if (url === null) throw new ConvexError({ code: "UPLOAD_NOT_FOUND" });
    return { url };
  },
});

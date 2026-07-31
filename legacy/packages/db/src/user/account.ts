import { ConvexError } from "convex/values";

import type { QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { authedQuery } from "../convex_helpers";

/**
 * User's with access have unlimited usage at the highest tier
 * @param ctx
 * @param userId
 * @returns true / false / undefined depending on user access level
 */
export async function hasUnlimitedAccess(ctx: QueryCtx, userId: string) {
  const user = await getUserByUserId(ctx, userId);
  if (!user) {
    return false;
  }
  return user.unlimited;
}

export async function isAdmin(ctx: QueryCtx, userId: string) {
  const user = await getUserByUserId(ctx, userId);
  if (!user) {
    return false;
  }
  return user.admin;
}

export async function getUserByUserId(ctx: QueryCtx, userId: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .unique();
  return user;
}

export const getEmail = authedQuery({
  args: {},
  handler: async (ctx) => {
    const user = await getUserByUserId(ctx, ctx.user.subject);
    if (!user) {
      return null;
    }
    return user.email;
  },
});

export const ensureUserExists = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Unauthenticated");
    }
    const existing = await getUserByUserId(ctx, identity.subject);
    if (existing) return;

    await ctx.db.insert("users", {
      userId: identity.subject,
      email: identity.email ?? "",
    });
  },
});

export const requestDelete = mutation({
  args: {},
  handler: async (ctx) => {
    // auth check
    const userId = await ctx.auth.getUserIdentity();
    if (!userId) {
      throw new Error("Unauthorized");
    }

    // delete all threads, messages, and files
    const [threads, files] = await Promise.all([
      ctx.db
        .query("threads")
        .withIndex("userId", (q) => q.eq("userId", userId.subject))
        .collect(),
      ctx.db
        .query("files")
        .withIndex("by_user", (q) => q.eq("userId", userId.subject))
        .collect(),
    ]);
    // For each thread, schedule the inlined async delete to clean up all
    // messages + streams + the thread row itself in pages.
    await Promise.all([
      ...threads.map((thread) =>
        ctx.scheduler.runAfter(
          0,
          internal.agent.threads.deleteAllForThreadIdAsync,
          { threadId: thread._id },
        ),
      ),
      ...files.map((file) => ctx.db.delete(file._id)),
    ]);

    // delete user from convex
    const user = await getUserByUserId(ctx, userId.subject);
    if (!user) {
      throw new Error("User not found");
    }
    await ctx.db.delete(user._id);

    // delete user from clerk & customer from polar

    await ctx.scheduler.runAfter(0, internal.user.clerk.deleteUser, {
      userId: userId.subject,
    });

    // delete all files from storage
    await ctx.scheduler.runAfter(
      0,

      internal.app.actions.deleteFilesFromStorage,
      {
        keys: files.map((file) => file.key),
      },
    );
  },
});

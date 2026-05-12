"use node";

import { clerkClient } from "@clerk/nextjs/server";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

export const deleteUser = internalAction({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = args;

    await ctx.runAction(internal.billing.actions.deleteCustomerAction, {
      userId,
    });

    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId);
  },
});

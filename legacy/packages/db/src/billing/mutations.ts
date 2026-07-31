import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { vPlanName } from "./plans";

export const upsertPolarProduct = internalMutation({
  args: {
    planName: vPlanName,
    polarProductId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("products")
      .withIndex("by_plan_name", (q) => q.eq("planName", args.planName))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        polarProductId: args.polarProductId,
      });
    } else {
      await ctx.db.insert("products", {
        planName: args.planName,
        polarProductId: args.polarProductId,
      });
    }
  },
});

export const upsertSubscription = internalMutation({
  args: {
    polarCustomerId: v.string(),
    polarSubscriptionId: v.string(),
    planName: vPlanName,
    status: v.string(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
  },
  handler: async (ctx, args) => {
    const customer = await ctx.db
      .query("customers")
      .withIndex("by_polar_id", (q) =>
        q.eq("polarCustomerId", args.polarCustomerId),
      )
      .unique();
    if (!customer) {
      console.error(
        "[BILLING] Cannot upsert subscription: no customer for",
        args.polarCustomerId,
      );
      return;
    }

    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_user_id", (q) => q.eq("userId", customer.userId))
      .unique();

    const data = {
      userId: customer.userId,
      planName: args.planName,
      polarSubscriptionId: args.polarSubscriptionId,
      polarCustomerId: args.polarCustomerId,
      status: args.status,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      lastSynced: Date.now(),
    };

    if (existing) {
      await ctx.db.replace(existing._id, data);
    } else {
      await ctx.db.insert("subscriptions", data);
    }
  },
});

export const deleteSubscriptionByCustomer = internalMutation({
  args: { polarCustomerId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_polar_customer_id", (q) =>
        q.eq("polarCustomerId", args.polarCustomerId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const upsertCustomer = internalMutation({
  args: {
    userId: v.string(),
    polarCustomerId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("customers")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        polarCustomerId: args.polarCustomerId,
        email: args.email,
      });
    } else {
      await ctx.db.insert("customers", {
        userId: args.userId,
        polarCustomerId: args.polarCustomerId,
        email: args.email,
      });
    }
  },
});

export const deleteCustomer = internalMutation({
  args: { polarCustomerId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("customers")
      .withIndex("by_polar_id", (q) =>
        q.eq("polarCustomerId", args.polarCustomerId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

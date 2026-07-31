import { v } from "convex/values";

import type { QueryCtx } from "../_generated/server";
import { internalQuery, query } from "../_generated/server";
import { PLANS, PURCHASABLE_PLANS } from "./plans";

export async function getSubscription(ctx: QueryCtx, userId: string) {
  return await ctx.db
    .query("subscriptions")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .unique();
}

export async function getCustomerByUserId(ctx: QueryCtx, userId: string) {
  return await ctx.db
    .query("customers")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .unique();
}

export const customerByUserId = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => getCustomerByUserId(ctx, args.userId),
});

export const customerByPolarId = internalQuery({
  args: { polarCustomerId: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("customers")
      .withIndex("by_polar_id", (q) =>
        q.eq("polarCustomerId", args.polarCustomerId),
      )
      .unique(),
});

export const subscriptionByUserId = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => getSubscription(ctx, args.userId),
});

export const allProductIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    return products.map((p) => p.polarProductId);
  },
});

export const listProducts = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    const polarIdByName = new Map(
      products.map((p) => [p.planName, p.polarProductId]),
    );

    return PURCHASABLE_PLANS.map((name) => {
      const def = PLANS[name];
      return {
        id: polarIdByName.get(name) ?? "",
        name,
        description: def.description,
        prices: [
          {
            priceAmount: def.price,
            priceCurrency: "usd",
            recurringInterval: def.recurringInterval,
          },
        ],
        recurringInterval: def.recurringInterval,
        isArchived: false,
        storageLimit: def.storageLimit,
      };
    });
  },
});

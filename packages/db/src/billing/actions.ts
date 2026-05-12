import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { getPolarClient } from "./client";
import { PLANS, PURCHASABLE_PLANS } from "./plans";
import { syncSubscriptionImpl } from "./sync";

export const syncSubscription = internalAction({
  args: { polarCustomerId: v.string() },
  handler: async (ctx, args) => {
    await syncSubscriptionImpl(ctx, args.polarCustomerId);
  },
});

export const syncSubscriptionByUser = internalAction({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const customer = await ctx.runQuery(
      internal.billing.queries.customerByUserId,
      { userId: args.userId },
    );
    if (!customer) return;
    await syncSubscriptionImpl(ctx, customer.polarCustomerId);
  },
});

export const syncProducts = internalAction({
  args: {},
  handler: async (ctx) => {
    const polar = getPolarClient();

    const existingByName = new Map<string, string>();
    const pages = await polar.products.list({ isArchived: false });
    for await (const page of pages) {
      for (const p of page.result.items) {
        existingByName.set(p.name, p.id);
      }
    }

    for (const name of PURCHASABLE_PLANS) {
      const def = PLANS[name];
      const match = existingByName.get(name);

      if (match) {
        await polar.products.update({
          id: match,
          productUpdate: {
            name,
            description: def.description ?? undefined,
          },
        });
        await ctx.runMutation(internal.billing.mutations.upsertPolarProduct, {
          planName: name,
          polarProductId: match,
        });
      } else {
        const created = await polar.products.create({
          name,
          description: def.description ?? undefined,
          recurringInterval: def.recurringInterval,
          prices: [
            {
              amountType: "fixed",
              priceAmount: def.price,
              priceCurrency: "usd",
            },
          ],
        });
        await ctx.runMutation(internal.billing.mutations.upsertPolarProduct, {
          planName: name,
          polarProductId: created.id,
        });
      }
    }
  },
});

export const deleteCustomerAction = internalAction({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const customer = await ctx.runQuery(
      internal.billing.queries.customerByUserId,
      { userId: args.userId },
    );
    if (!customer) return;

    const polar = getPolarClient();
    await polar.customers.delete({ id: customer.polarCustomerId });
    await ctx.runMutation(internal.billing.mutations.deleteCustomer, {
      polarCustomerId: customer.polarCustomerId,
    });
  },
});

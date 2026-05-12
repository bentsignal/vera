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

    const allProducts = [];
    const pages = await polar.products.list({});
    for await (const page of pages) {
      allProducts.push(
        ...page.result.items.map((p) => ({ id: p.id, name: p.name })),
      );
    }
    const existingByName = new Map(allProducts.map((p) => [p.name, p]));

    for (const name of PURCHASABLE_PLANS) {
      const def = PLANS[name];
      const match = existingByName.get(name);

      if (match) {
        await polar.products.update({
          id: match.id,
          productUpdate: {
            name,
            description: def.description ?? undefined,
            prices: [
              {
                amountType: "fixed",
                priceAmount: def.price,
                priceCurrency: "usd",
              },
            ],
          },
        });
        await ctx.runMutation(internal.billing.mutations.upsertPolarProduct, {
          planName: name,
          polarProductId: match.id,
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

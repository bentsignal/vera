"use node";

import { validateEvent } from "@polar-sh/sdk/webhooks";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { env } from "../convex.env";
import { syncSubscriptionImpl } from "./sync";

type WebhookPayload = ReturnType<typeof validateEvent>;

type SubscriptionEventType =
  | "subscription.created"
  | "subscription.active"
  | "subscription.updated"
  | "subscription.canceled"
  | "subscription.revoked"
  | "subscription.uncanceled"
  | "subscription.past_due";

const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created",
  "subscription.active",
  "subscription.updated",
  "subscription.canceled",
  "subscription.revoked",
  "subscription.uncanceled",
  "subscription.past_due",
]);

function isSubscriptionEvent(
  event: WebhookPayload,
): event is Extract<WebhookPayload, { type: SubscriptionEventType }> {
  return SUBSCRIPTION_EVENTS.has(event.type);
}

export const processWebhook = internalAction({
  args: {
    body: v.string(),
    webhookId: v.string(),
    webhookTimestamp: v.string(),
    webhookSignature: v.string(),
  },
  handler: async (ctx, args) => {
    const headers = {
      "webhook-id": args.webhookId,
      "webhook-timestamp": args.webhookTimestamp,
      "webhook-signature": args.webhookSignature,
    };
    const event = validateEvent(args.body, headers, env.POLAR_WEBHOOK_SECRET);

    if (isSubscriptionEvent(event)) {
      await syncSubscriptionImpl(ctx, event.data.customerId);
      return;
    }

    if (
      event.type === "customer.created" ||
      event.type === "customer.updated"
    ) {
      const userId = event.data.metadata.userId;
      if (typeof userId === "string") {
        await ctx.runMutation(internal.billing.mutations.upsertCustomer, {
          userId,
          polarCustomerId: event.data.id,
          email: event.data.email ?? "",
        });
      }
      return;
    }

    if (event.type === "customer.deleted") {
      await ctx.runMutation(
        internal.billing.mutations.deleteSubscriptionByCustomer,
        { polarCustomerId: event.data.id },
      );
      await ctx.runMutation(internal.billing.mutations.deleteCustomer, {
        polarCustomerId: event.data.id,
      });
    }
  },
});

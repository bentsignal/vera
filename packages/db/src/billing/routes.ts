import { z } from "zod";

import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { getPolarClient } from "./client";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Convex-Client",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function corsAction(handler: Parameters<typeof httpAction>[0]) {
  return httpAction(async (ctx, req) => {
    try {
      return await handler(ctx, req);
    } catch (error) {
      console.error(`[HTTP] ${req.url} failed:`, error);
      return jsonResponse({ error: "Internal server error" }, 500);
    }
  });
}

export const preflightHandler = httpAction(() =>
  Promise.resolve(new Response(null, { status: 204, headers: CORS_HEADERS })),
);

export const webhookHandler = httpAction(async (ctx, req) => {
  const body = await req.text();
  const webhookId = req.headers.get("webhook-id") ?? "";
  const webhookTimestamp = req.headers.get("webhook-timestamp") ?? "";
  const webhookSignature = req.headers.get("webhook-signature") ?? "";

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return new Response("Missing webhook headers", { status: 400 });
  }

  try {
    await ctx.runAction(internal.billing.webhook.processWebhook, {
      body,
      webhookId,
      webhookTimestamp,
      webhookSignature,
    });
  } catch (error) {
    console.error("[POLAR WEBHOOK] Processing failed:", error);
  }

  return new Response("OK", { status: 200 });
});

export const checkoutHandler = corsAction(async (ctx, req) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return jsonResponse({ error: "Unauthorized" }, 401);

  const body = z
    .object({
      productId: z.string().optional(),
      successUrl: z.string().optional(),
    })
    .parse(await req.json());

  const polar = getPolarClient();

  const productIds = await ctx.runQuery(internal.billing.queries.allProductIds);
  if (productIds.length === 0) {
    return jsonResponse({ error: "No products configured" }, 500);
  }

  const orderedIds = body.productId
    ? [body.productId, ...productIds.filter((id) => id !== body.productId)]
    : productIds;

  const existing = await ctx.runQuery(
    internal.billing.queries.customerByUserId,
    { userId: identity.subject },
  );

  let polarCustomerId: string;
  if (existing) {
    polarCustomerId = existing.polarCustomerId;
  } else {
    const email = identity.email ?? "";
    let customerId: string;
    try {
      const newCustomer = await polar.customers.create({
        email,
        metadata: { userId: identity.subject },
      });
      customerId = newCustomer.id;
    } catch {
      const { result } = await polar.customers.list({ email, page: 1 });
      const existing = result.items.at(0);
      if (!existing) {
        throw new Error("Customer not found after create conflict");
      }
      customerId = existing.id;
    }
    await ctx.runMutation(internal.billing.mutations.upsertCustomer, {
      userId: identity.subject,
      polarCustomerId: customerId,
      email,
    });
    polarCustomerId = customerId;
  }

  const session = await polar.checkouts.create({
    products: orderedIds,
    customerId: polarCustomerId,
    successUrl: body.successUrl,
  });

  return jsonResponse({ url: session.url });
});

export const customerPortalHandler = corsAction(async (ctx, _req) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return jsonResponse({ error: "Unauthorized" }, 401);

  const customer = await ctx.runQuery(
    internal.billing.queries.customerByUserId,
    { userId: identity.subject },
  );
  if (!customer) {
    return jsonResponse({ error: "No subscription found" }, 404);
  }

  const polar = getPolarClient();
  const session = await polar.customerSessions.create({
    customerId: customer.polarCustomerId,
  });

  return jsonResponse({ url: session.customerPortalUrl });
});

export const planSyncHandler = corsAction(async (ctx, _req) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return jsonResponse({ error: "Unauthorized" }, 401);

  await ctx.runAction(internal.billing.actions.syncSubscriptionByUser, {
    userId: identity.subject,
  });

  const subscription = await ctx.runQuery(
    internal.billing.queries.subscriptionByUserId,
    { userId: identity.subject },
  );

  return jsonResponse({ planName: subscription?.planName ?? "Free" });
});

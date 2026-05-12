import { z } from "zod";

import { env } from "~/env";

const siteUrl = env.VITE_CONVEX_URL.replace(".convex.cloud", ".convex.site");

const urlResponse = z.object({ url: z.string() });

async function billingFetch(path: string, token: string, body?: unknown) {
  const resp = await fetch(`${siteUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  if (!resp.ok) throw new Error(`Billing request failed: ${resp.status}`);
  return urlResponse.parse(await resp.json()).url;
}

export function createCheckoutUrl(token: string, productId?: string) {
  return billingFetch("/checkout", token, {
    productId,
    successUrl: window.location.origin + "/pricing",
  });
}

export function getCustomerPortalUrl(token: string) {
  return billingFetch("/customer-portal", token);
}

const planResponse = z.object({ planName: z.string() });

export async function syncPlan(token: string) {
  const resp = await fetch(`${siteUrl}/plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  if (!resp.ok) return null;
  return planResponse.parse(await resp.json()).planName;
}

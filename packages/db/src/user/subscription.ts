import { v } from "convex/values";

import type { QueryCtx } from "../_generated/server";
import type { PlanName } from "../billing/plans";
import { internalQuery } from "../_generated/server";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  getPlanDef,
  hasScope,
  HIGHEST_PUBLIC_PLAN,
  PLANS,
} from "../billing/plans";
import { getSubscription } from "../billing/queries";
import { authedQuery } from "../convex_helpers";
import { hasUnlimitedAccess } from "./account";

export interface Plan {
  name: PlanName;
  price: number;
  max: boolean;
}

export async function getUserPlanHelper(ctx: QueryCtx, userId: string) {
  const [subscription, unlimited] = await Promise.all([
    getSubscription(ctx, userId),
    hasUnlimitedAccess(ctx, userId),
  ]);

  if (unlimited) {
    const def = getPlanDef("Unlimited");
    return {
      name: "Unlimited",
      price: def.price,
      max: true,
    } satisfies Plan;
  }

  if (!subscription || !ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    return {
      name: "Free",
      price: 0,
      max: false,
    } satisfies Plan;
  }

  const def = getPlanDef(subscription.planName);
  return {
    name: subscription.planName,
    price: def.price,
    max: subscription.planName === HIGHEST_PUBLIC_PLAN,
  } satisfies Plan;
}

export const getPlan = authedQuery({
  args: {},
  handler: async (ctx) => {
    return await getUserPlanHelper(ctx, ctx.user.subject);
  },
});

export const getPlanTier = internalQuery({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const plan = await getUserPlanHelper(ctx, args.userId);
    return PLANS[plan.name].tier;
  },
});

export function isModelSelectionAllowed(plan: Plan) {
  return hasScope(plan.name, "modelSelection");
}

export const showModelSelector = authedQuery({
  args: {},
  handler: async (ctx) => {
    const plan = await getUserPlanHelper(ctx, ctx.user.subject);
    return isModelSelectionAllowed(plan);
  },
});

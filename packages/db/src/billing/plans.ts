import { literals } from "convex-helpers/validators";

const GB = 1024 * 1024 * 1024;

interface PlanScopes {
  modelSelection?: true;
  imageGeneration?: true;
}

interface Plan {
  tier: number;
  price: number;
  recurringInterval: "month" | "year" | null;
  description: string | null;
  storageLimit: number;
  scopes?: PlanScopes;
}

// IMPORTANT: This object should be the source of truth for plan data. You should
// NOT EVER make changes to plan data inside the polar dashboard. You can use
// billing/actions:syncProducts to sync this object with Polar. It will run at build
// time in production, but you have to do it manually in dev. There should be a script
// in package.json to do it in dev.
export const PLANS = {
  Free: {
    tier: 0,
    price: 0,
    recurringInterval: null,
    description: null,
    storageLimit: 0,
  },
  Light: {
    tier: 1,
    price: 4_00,
    recurringInterval: "month",
    description: "Essential features for casual users",
    storageLimit: 5 * GB,
  },
  Premium: {
    tier: 2,
    price: 8_00,
    recurringInterval: "month",
    description: "Advanced features and model selection",
    storageLimit: 20 * GB,
    scopes: {
      modelSelection: true,
      imageGeneration: true,
    },
  },
  Ultra: {
    tier: 3,
    price: 16_00,
    recurringInterval: "month",
    description: "Maximum features and storage",
    storageLimit: 50 * GB,
    scopes: {
      modelSelection: true,
      imageGeneration: true,
    },
  },
  Unlimited: {
    tier: 4,
    price: 0,
    recurringInterval: null,
    description: null,
    storageLimit: 100 * GB,
    scopes: {
      modelSelection: true,
      imageGeneration: true,
    },
  },
} as const satisfies Record<string, Plan>;

export type PlanName = keyof typeof PLANS;
export type ScopeName = keyof PlanScopes;

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- derived from PLANS source of truth
const PLAN_NAMES = Object.keys(PLANS) as [PlanName, ...PlanName[]];
export const vPlanName = literals(...PLAN_NAMES);

export const ALLOWED_USAGE_PERCENTAGE = 0.6;
export const FREE_TIER_MAX_USAGE = 0.03;

export const HIGHEST_PUBLIC_PLAN = "Ultra" satisfies PlanName;

function isPlanName(name: string): name is PlanName {
  return name in PLANS;
}

export const PURCHASABLE_PLANS = PLAN_NAMES.filter(
  (name) => PLANS[name].recurringInterval !== null && PLANS[name].price > 0,
);

export function parsePlanName(name: string) {
  if (isPlanName(name)) return name;
  return "Free" satisfies PlanName;
}

export function getPlanDef(name: PlanName) {
  return PLANS[name];
}

export function tierOf(name: PlanName) {
  return PLANS[name].tier;
}

export function isAtLeastTier({
  plan,
  minimum,
}: {
  plan: PlanName;
  minimum: PlanName;
}) {
  return PLANS[plan].tier >= PLANS[minimum].tier;
}

export function hasScope(plan: PlanName, scope: ScopeName) {
  const def = getPlanDef(plan);
  if (!("scopes" in def)) return false;
  return scope in def.scopes;
}

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
]);

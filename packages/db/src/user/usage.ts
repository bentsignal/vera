import type { LanguageModelUsage } from "ai";
import { TableAggregate } from "@convex-dev/aggregate";
import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";
import { v } from "convex/values";

import type { DataModel } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { LanguageModel } from "../ai/models/types";
import type { Plan } from "../user/subscription";
import { components } from "../_generated/api";
import { internalMutation, mutation, query } from "../_generated/server";
import { modelPresets } from "../ai/models/presets";
import {
  GatewayProviderMetadata,
  OpenRouterProviderMetadata,
} from "../ai/models/types";
import {
  ALLOWED_USAGE_PERCENTAGE,
  FREE_TIER_MAX_USAGE,
} from "../billing/plans";
import { authedQuery, checkApiKey, checkAuth } from "../convex_helpers";
import * as timeHelpers from "../lib/date_time_utils";
import { getUserPlanHelper } from "../user/subscription";
import { getUserInfoHelper } from "./info";

const UsageType = v.union(
  v.literal("message"),
  v.literal("tool_call"),
  v.literal("transcription"),
);

export const usage = new TableAggregate<{
  Namespace: string;
  Key: number;
  DataModel: DataModel;
  TableName: "usage";
}>(components.aggregateUsage, {
  namespace: (doc) => doc.userId,
  sortKey: (doc) => doc._creationTime,
  sumValue: (doc) => doc.cost,
});

const triggers = new Triggers<DataModel>();
triggers.register("usage", usage.trigger());

const usageTriggerInternalMutation = customMutation(
  internalMutation,
  customCtx(triggers.wrapDB),
);

const apiAuthedUsageTriggerMutation = customMutation(mutation, {
  args: {
    apiKey: v.string(),
  },
  input: async (ctx, args) => {
    checkApiKey(args.apiKey);
    const user = await checkAuth(ctx);
    const wrappedCtx = triggers.wrapDB(ctx);
    return { ctx: { ...wrappedCtx, user }, args };
  },
});

async function getUsageHelper(ctx: QueryCtx, userId: string, plan?: Plan) {
  const resolvedPlan = plan ?? (await getUserPlanHelper(ctx, userId));

  const limit =
    resolvedPlan.price === 0
      ? FREE_TIER_MAX_USAGE
      : resolvedPlan.price * ALLOWED_USAGE_PERCENTAGE;
  const range = resolvedPlan.price === 0 ? "daily" : "monthly";

  let start, end;
  if (range === "monthly") {
    ({ start, end } = timeHelpers.getMonthBounds());
  } else {
    ({ start, end } = timeHelpers.getDayBounds());
  }

  const bounds = {
    lower: { key: start.getTime(), inclusive: true },
    upper: { key: end.getTime(), inclusive: true },
  };
  const totalUsage = await usage.sum(ctx, {
    namespace: userId,
    bounds,
  });

  const unlimited = resolvedPlan.name === "Unlimited";

  return {
    endOfPeriod: end.toISOString(),
    percentageUsed: Math.min((totalUsage / limit) * 100, 100),
    limitHit: !unlimited && totalUsage >= limit,
    range,
    unlimited,
  };
}

export function calculateModelCost({
  model,
  usage,
  providerMetadata,
}: {
  model?: LanguageModel;
  usage: LanguageModelUsage;
  providerMetadata?: Record<string, Record<string, unknown>>;
}) {
  const openRouterMetadata =
    OpenRouterProviderMetadata.safeParse(providerMetadata);
  if (openRouterMetadata.success) {
    return openRouterMetadata.data.openrouter.usage.cost;
  }
  const gatewayMetadata = GatewayProviderMetadata.safeParse(providerMetadata);
  if (gatewayMetadata.success) {
    return Number(gatewayMetadata.data.gateway.cost);
  }
  const fallbackModel = model ?? modelPresets.default;
  const inputCost =
    fallbackModel.cost.in * ((usage.inputTokens ?? 0) / 1_000_000);
  const outputCost =
    fallbackModel.cost.out * ((usage.outputTokens ?? 0) / 1_000_000);
  const totalCost = inputCost + outputCost + fallbackModel.cost.other;
  return totalCost;
}

export const log = usageTriggerInternalMutation({
  args: v.object({
    cost: v.number(),
    userId: v.string(),
    type: UsageType,
  }),
  handler: async (ctx, args) => {
    await ctx.db.insert("usage", {
      userId: args.userId,
      cost: args.cost,
      type: args.type,
    });
  },
});

export const logTranscription = apiAuthedUsageTriggerMutation({
  args: v.object({
    duration: v.number(),
  }),
  handler: async (ctx, args) => {
    const cost =
      modelPresets.transcription.cost.other * Math.ceil(args.duration / 60);
    await ctx.db.insert("usage", {
      userId: ctx.user.subject,
      cost,
      type: "transcription",
    });
  },
});

export const getUsage = authedQuery({
  handler: async (ctx) => {
    const usage = await getUsageHelper(ctx, ctx.user.subject);
    return usage;
  },
});

// Pre-fetches userPlan, userInfo, and usage so helpers in the call graph can
// read them from ctx instead of re-running `getUserPlanHelper` (and its
// Polar + hasUnlimitedAccess reads) multiple times per invocation. Use this
// only for hot paths that actually need all three fields (sendMessage, create);
// cheaper mutations should stay on `authedMutation`.
async function buildUsageCheckedCtx(ctx: QueryCtx | MutationCtx) {
  const user = await checkAuth(ctx);
  const userId = user.subject;
  const [userPlan, userInfo] = await Promise.all([
    getUserPlanHelper(ctx, userId),
    getUserInfoHelper(ctx, userId),
  ]);
  const usage = await getUsageHelper(ctx, userId, userPlan);
  return { user, userPlan, userInfo, usage };
}

export const usageCheckedMutation = customMutation(
  mutation,
  customCtx(buildUsageCheckedCtx),
);

export const usageCheckedQuery = customQuery(
  query,
  customCtx(buildUsageCheckedCtx),
);

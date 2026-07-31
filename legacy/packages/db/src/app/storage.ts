import { TableAggregate } from "@convex-dev/aggregate";
import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";
import { v } from "convex/values";

import type { DataModel } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { components } from "../_generated/api";
import { internalMutation, mutation } from "../_generated/server";
import { PLANS } from "../billing/plans";
import {
  apiMutation,
  authedMutation,
  checkApiKey,
  checkAuth,
} from "../convex_helpers";
import { limiter } from "../limiter";
import { getUserPlanHelper } from "../user/subscription";

export const storage = new TableAggregate<{
  Namespace: string;
  Key: number;
  DataModel: DataModel;
  TableName: "files";
}>(components.aggregateStorage, {
  namespace: (doc) => doc.userId,
  sortKey: (doc) => doc._creationTime,
  sumValue: (doc) => doc.size,
});

const triggers = new Triggers<DataModel>();
triggers.register("files", storage.trigger());

export const apiStorageTriggerMutation = customMutation(mutation, {
  args: {
    apiKey: v.string(),
  },
  input: (ctx, args) => {
    checkApiKey(args.apiKey);
    const wrappedCtx = triggers.wrapDB(ctx);
    return { ctx: wrappedCtx, args };
  },
});

export const authedStorageTriggerMutation = customMutation(
  authedMutation,
  customCtx(async (ctx) => {
    const user = await checkAuth(ctx);
    const wrappedCtx = triggers.wrapDB(ctx);
    return { ...wrappedCtx, user };
  }),
);

export const internalStorageTriggerMutation = customMutation(
  internalMutation,
  customCtx(triggers.wrapDB),
);

export async function getStorageHelper(
  ctx: QueryCtx | MutationCtx,
  userId: string,
) {
  const plan = await getUserPlanHelper(ctx, userId);
  const storageLimit = PLANS[plan.name].storageLimit;

  const bounds = {
    lower: { key: 0, inclusive: true },
    upper: { key: Date.now(), inclusive: true },
  };
  const storageUsed = await storage.sum(ctx, {
    namespace: userId,
    bounds,
  });

  return {
    storageLimit,
    storageUsed,
  };
}

export const verifyUpload = apiMutation({
  args: {
    userId: v.string(),
    payloadSize: v.number(),
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, payloadSize } = args;

    const { ok } = await limiter.limit(ctx, "upload", {
      key: userId,
    });
    if (!ok) {
      return {
        allow: false,
        reason: "Uploading too fast, try again shortly",
      };
    }

    const { storageUsed, storageLimit } = await getStorageHelper(ctx, userId);
    if (storageUsed + payloadSize >= storageLimit) {
      return {
        allow: false,
        reason: "Not enough storage space for this upload",
      };
    }

    return {
      allow: true,
      reason: "Upload allowed",
    };
  },
});

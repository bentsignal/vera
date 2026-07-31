import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { ConvexError, v } from "convex/values";

import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { env } from "./convex.env";

export function checkApiKey(apiKey: string) {
  if (apiKey !== env.NEXT_CONVEX_INTERNAL_KEY) {
    throw new ConvexError("Invalid key");
  }
}

export async function checkAuth(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const user = await ctx.auth.getUserIdentity();
  if (!user) {
    throw new ConvexError("Unauthenticated");
  }
  return user;
}

export const apiMutation = customMutation(mutation, {
  args: {
    apiKey: v.string(),
  },
  input: (ctx, args) => {
    const { apiKey } = args;
    checkApiKey(apiKey);
    return { ctx, args: {} };
  },
});

export const apiQuery = customQuery(query, {
  args: {
    apiKey: v.string(),
  },
  input: (ctx, args) => {
    const { apiKey } = args;
    checkApiKey(apiKey);
    return { ctx, args: {} };
  },
});

export const authedMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const user = await checkAuth(ctx);
    return { user };
  }),
);

export const authedQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const user = await checkAuth(ctx);
    return { user };
  }),
);

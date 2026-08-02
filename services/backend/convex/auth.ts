import type { GenericCtx } from "@convex-dev/better-auth";
import { createClient } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";

import type { DataModel } from "./_generated/dataModel";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import { actorFromEmail, requireEnvironment } from "./lib";

export const authComponent = createClient<DataModel>(components.betterAuth);

export function createAuth(ctx: GenericCtx<DataModel>) {
  const siteUrl = requireEnvironment("SITE_URL");
  return betterAuth({
    baseURL: requireEnvironment("CONVEX_SITE_URL"),
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      crossDomain({ siteUrl }),
      convex({ authConfig, jwksRotateOnTokenGenerationError: true }),
    ],
    trustedOrigins: [siteUrl],
  });
}

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const user = await authComponent.getAuthUser(ctx);
    return {
      actor: actorFromEmail(user.email),
    };
  },
});

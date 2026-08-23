import { defineComponentDispatchers } from "@decentralized-convex/server";
import { ConvexError } from "convex/values";

import type { QueryCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";
import { accountsProtocol } from "./protocol.ts";

export const { dispatchMutation, dispatchQuery } = defineComponentDispatchers({
  handlers: {
    mutations: {
      upsertMyProfile: async (ctx, { args, identity }) => {
        const accountId = requireAccountId(identity);
        const displayName = args.displayName.trim();
        if (displayName.length === 0 || displayName.length > 80) {
          throw new ConvexError({ code: "INVALID_DISPLAY_NAME" });
        }

        const profile = {
          accountId,
          avatarUrl: args.avatarUrl,
          displayName,
        };
        const existing = await ctx.db
          .query("profiles")
          .withIndex("by_account", (index) => index.eq("accountId", accountId))
          .unique();

        if (existing === null) {
          await ctx.db.insert("profiles", profile);
        } else {
          await ctx.db.patch(existing._id, {
            avatarUrl: profile.avatarUrl,
            displayName: profile.displayName,
          });
        }
        return profile;
      },
    },
    queries: {
      getMyProfile: async (ctx, { identity }) => {
        if (identity === null) return null;
        return findProfile(ctx, requireAccountId(identity));
      },
      getProfile: (ctx, { args }) =>
        findProfile(ctx, args.accountId.trim().toLowerCase()),
    },
  },
  mutation,
  protocol: accountsProtocol,
  query,
});

function requireAccountId(
  identity: null | { accountId?: string; email?: string },
) {
  const accountId = (identity?.accountId ?? identity?.email)
    ?.trim()
    .toLowerCase();
  if (accountId?.includes("@") !== true) {
    throw new ConvexError({ code: "AUTHENTICATED_ACCOUNT_REQUIRED" });
  }
  return accountId;
}

async function findProfile(ctx: QueryCtx, accountId: string) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_account", (index) => index.eq("accountId", accountId))
    .unique();
  return profile === null
    ? null
    : {
        accountId: profile.accountId,
        avatarUrl: profile.avatarUrl,
        displayName: profile.displayName,
      };
}

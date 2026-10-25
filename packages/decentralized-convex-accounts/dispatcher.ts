import type { OperationArgs } from "@decentralized-convex/plugin";
import type {
  OperationHandlers,
  QueryOperationHandlers,
} from "@decentralized-convex/server";
import {
  defineComponentDispatchers,
  routedQueryResult,
} from "@decentralized-convex/server";
import { ConvexError } from "convex/values";

import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { AccountProfile } from "./protocol.ts";
import { mutation, query } from "./_generated/server.js";
import { isAffiliated } from "./affiliations.ts";
import { accountsProtocol } from "./protocol.ts";

export const profileHandlers = {
  mutations: {
    upsertMyProfile: async (ctx, { args, identity }) => {
      const accountId = requireAccountId(identity);
      const existing = await ctx.db
        .query("profiles")
        .withIndex("by_account", (index) => index.eq("accountId", accountId))
        .unique();
      const affiliated = await isAffiliated(ctx, accountId);
      if (args.createOnly === true && existing !== null) {
        return {
          accountId,
          avatarUrl: existing.avatarUrl,
          displayName: existing.displayName,
          affiliated,
        };
      }
      const profile = editedProfile(accountId, existing, args);
      if (existing === null) {
        await ctx.db.insert("profiles", profile);
      } else {
        await ctx.db.patch(existing._id, {
          avatarUrl: profile.avatarUrl,
          displayName: profile.displayName,
        });
      }
      return { ...profile, affiliated };
    },
  },
  queries: {
    getMyProfile: async (ctx, { identity }) => {
      // A session may briefly lose auth while reconnecting. That is not
      // evidence the profile is missing, especially for older initializers.
      return findProfile(ctx, requireAccountId(identity));
    },
    getProfile: async (ctx, { args }) => {
      const accountId = args.accountId.trim().toLowerCase();
      const profile = await findProfile(ctx, accountId);
      // A PDS keeps only its own accounts' profiles, so one it doesn't
      // have is asked of the account's home PDS too.
      return profile ?? routedQueryResult(null, [accountId]);
    },
  },
} satisfies {
  mutations: OperationHandlers<typeof accountsProtocol.mutations, MutationCtx>;
  queries: QueryOperationHandlers<typeof accountsProtocol.queries, QueryCtx>;
};

export const { dispatchMutation, dispatchQueries, dispatchQuery } =
  defineComponentDispatchers({
    handlers: profileHandlers,
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
        affiliated: await isAffiliated(ctx, accountId),
        avatarUrl: profile.avatarUrl,
        displayName: profile.displayName,
      };
}

function editedProfile(
  accountId: string,
  existing: Pick<AccountProfile, "avatarUrl" | "displayName"> | null,
  args: OperationArgs<typeof accountsProtocol.mutations.upsertMyProfile>,
) {
  const displayName =
    args.displayName?.trim() ??
    existing?.displayName ??
    accountId.slice(0, accountId.lastIndexOf("@"));
  if (displayName.length === 0 || displayName.length > 80) {
    throw new ConvexError({ code: "INVALID_DISPLAY_NAME" });
  }
  return {
    accountId,
    avatarUrl:
      args.avatarUrl === undefined
        ? (existing?.avatarUrl ?? null)
        : args.avatarUrl,
    displayName,
  };
}

import { formatAddress, parseAddress } from "@decentralized-convex/address";
import { ConvexError, v } from "convex/values";

import type { MutationCtx } from "./_generated/server";
import { components } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireEnvironment } from "./lib";

/**
 * Affiliated accounts speak for this PDS, such as `support@vera.chat`, and
 * the app shows a check badge next to their names. Only accounts on this
 * PDS's own domain can be affiliated.
 */

/** Operator command: `npx convex run affiliations:add '{"address":"support@vera.chat"}'`. */
export const add = internalMutation({
  args: { address: v.string() },
  handler: async (ctx, { address }) => {
    const accountId = await requireOwnAccount(ctx, address);
    await ctx.runMutation(components.accounts.affiliations.setAffiliated, {
      accountId,
      affiliated: true,
    });
    return accountId;
  },
});

/** Operator command: `npx convex run affiliations:remove '{"address":"support@vera.chat"}'`. */
export const remove = internalMutation({
  args: { address: v.string() },
  handler: async (ctx, { address }) => {
    const accountId = formatAddress(parseAddress(address));
    await ctx.runMutation(components.accounts.affiliations.setAffiliated, {
      accountId,
      affiliated: false,
    });
    return accountId;
  },
});

/** Operator command: `npx convex run affiliations:list`. */
export const list = internalQuery({
  args: {},
  handler: (ctx) =>
    ctx.runQuery(components.accounts.affiliations.listAffiliated, {}),
});

async function requireOwnAccount(ctx: MutationCtx, address: string) {
  const parsed = parseAddress(address);
  if (parsed.domain !== requireEnvironment("FEDERATION_DOMAIN").toLowerCase()) {
    throw new ConvexError({ code: "NOT_THIS_PDS" });
  }
  const accountId = formatAddress(parsed);
  const user: unknown = await ctx.runQuery(
    components.betterAuth.adapter.findOne,
    {
      model: "user",
      where: [{ field: "email", value: accountId }],
    },
  );
  if (user === null) {
    throw new ConvexError({ code: "ACCOUNT_NOT_FOUND" });
  }
  return accountId;
}

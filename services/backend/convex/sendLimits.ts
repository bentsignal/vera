import type { PdsRouterMutationRequest } from "@decentralized-convex/server";
import { ConvexError, v } from "convex/values";

import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  currentDomainSends,
  currentSends,
  sendKey,
  takeDomainSend,
  takeSend,
} from "../send-limits";
import { internalMutation, internalQuery } from "./_generated/server";
import { field } from "./botAccounts";

// How fast one person can send messages (`SEND_BURST` and `SEND_REFILL_MS`
// in send-limits.ts), and all the visitors from one other server together
// (`DOMAIN_SEND_BURST`). Checked by the PDS router before a client's send
// reaches the messages Component (pds.ts), which is the only way clients
// send. Vera's own bots send through the Component directly and aren't
// counted.

function bucketOf(ctx: Pick<QueryCtx, "db">, accountId: string) {
  return ctx.db
    .query("sendLimits")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .unique();
}

function domainBucketOf(ctx: Pick<QueryCtx, "db">, domain: string) {
  return ctx.db
    .query("domainSendLimits")
    .withIndex("by_domain", (q) => q.eq("domain", domain))
    .unique();
}

/**
 * The router's `beforeMutation` (pds.ts): takes one message from the
 * sender's allowance, and for a visitor from their server's too, or refuses
 * the send with `RATE_LIMITED` and how long until it can go
 * (`retryAfterMs`). A refused send writes nothing.
 */
export async function limitSends(
  ctx: MutationCtx,
  { identity, operation, plugin }: PdsRouterMutationRequest,
) {
  if (plugin !== "messages" || field(operation, "type") !== "send") return;
  if (identity?.accountId === undefined) return;
  const accountId = sendKey(identity.accountId);
  const now = Date.now();
  const stored = await bucketOf(ctx, accountId);
  const result = takeSend(currentSends(stored, accountId, now));
  if (!result.ok) refuse(result.retryAfterMs);
  const domain = identity.home;
  if (domain !== undefined) {
    const storedDomain = await domainBucketOf(ctx, domain);
    const domainResult = takeDomainSend(currentDomainSends(storedDomain, now));
    if (!domainResult.ok) refuse(domainResult.retryAfterMs);
    if (storedDomain === null) {
      await ctx.db.insert("domainSendLimits", {
        ...domainResult.bucket,
        domain,
      });
    } else {
      await ctx.db.replace(storedDomain._id, {
        ...domainResult.bucket,
        domain,
      });
    }
  }
  if (stored === null) await ctx.db.insert("sendLimits", result.bucket);
  else await ctx.db.replace(stored._id, result.bucket);
}

function refuse(retryAfterMs: number): never {
  throw new ConvexError({ code: "RATE_LIMITED", retryAfterMs });
}

/**
 * Operator command:
 * `npx convex run sendLimits:status '{"accountId":"someone@vera.chat"}'`.
 */
export const status = internalQuery({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    const accountId = sendKey(args.accountId);
    const bucket = currentSends(
      await bucketOf(ctx, accountId),
      accountId,
      Date.now(),
    );
    return { messagesLeft: Math.floor(bucket.tokens) };
  },
});

/**
 * Operator command:
 * `npx convex run sendLimits:reset '{"accountId":"someone@vera.chat"}'`.
 */
export const reset = internalMutation({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }) => {
    const bucket = await bucketOf(ctx, sendKey(accountId));
    if (bucket !== null) await ctx.db.delete(bucket._id);
  },
});

/**
 * Operator command:
 * `npx convex run sendLimits:domainStatus '{"domain":"example.com"}'`.
 */
export const domainStatus = internalQuery({
  args: { domain: v.string() },
  handler: async (ctx, { domain }) => {
    const bucket = currentDomainSends(
      await domainBucketOf(ctx, domain.trim().toLowerCase()),
      Date.now(),
    );
    return { messagesLeft: Math.floor(bucket.tokens) };
  },
});

/**
 * Operator command:
 * `npx convex run sendLimits:domainReset '{"domain":"example.com"}'`.
 */
export const domainReset = internalMutation({
  args: { domain: v.string() },
  handler: async (ctx, { domain }) => {
    const bucket = await domainBucketOf(ctx, domain.trim().toLowerCase());
    if (bucket !== null) await ctx.db.delete(bucket._id);
  },
});

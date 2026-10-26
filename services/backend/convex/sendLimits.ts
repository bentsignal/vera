import type { PdsRouterMutationRequest } from "@decentralized-convex/server";
import { ConvexError, v } from "convex/values";

import type { MutationCtx, QueryCtx } from "./_generated/server";
import { currentSends, takeSend } from "../send-limits";
import { internalMutation, internalQuery } from "./_generated/server";
import { field } from "./bots";

// How fast one person can send messages (`SEND_BURST` and `SEND_REFILL_MS`
// in send-limits.ts). Checked by the PDS router before a client's send
// reaches the messages Component (pds.ts), which is the only way clients
// send. Vera's own bots send through the Component directly and aren't
// counted.

function bucketOf(ctx: Pick<QueryCtx, "db">, accountId: string) {
  return ctx.db
    .query("sendLimits")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .unique();
}

/**
 * The router's `beforeMutation` (pds.ts): takes one message from the
 * sender's allowance, or refuses the send with `RATE_LIMITED` and how long
 * until it can go (`retryAfterMs`). A refused send writes nothing.
 */
export async function limitSends(
  ctx: MutationCtx,
  { identity, operation, plugin }: PdsRouterMutationRequest,
) {
  if (plugin !== "messages" || field(operation, "type") !== "send") return;
  const accountId = identity?.accountId;
  if (accountId === undefined) return;
  const now = Date.now();
  const stored = await bucketOf(ctx, accountId);
  const result = takeSend(currentSends(stored, accountId, now));
  if (!result.ok) {
    throw new ConvexError({
      code: "RATE_LIMITED",
      retryAfterMs: result.retryAfterMs,
    });
  }
  if (stored === null) await ctx.db.insert("sendLimits", result.bucket);
  else await ctx.db.replace(stored._id, result.bucket);
}

/**
 * Operator command:
 * `npx convex run sendLimits:status '{"accountId":"someone@vera.chat"}'`.
 */
export const status = internalQuery({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }) => {
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
    const bucket = await bucketOf(ctx, accountId);
    if (bucket !== null) await ctx.db.delete(bucket._id);
  },
});

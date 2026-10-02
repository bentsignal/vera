import type { MutationCtx } from "./_generated/server.js";

/**
 * A device signed into several accounts registers its token once per
 * account, and gets each account's notifications.
 */
async function findToken(ctx: MutationCtx, self: string, token: string) {
  const rows = await ctx.db
    .query("pushTokens")
    .withIndex("by_token", (index) => index.eq("token", token))
    .collect();
  return rows.find((row) => row.accountId === self) ?? null;
}

export async function registerPushToken(
  ctx: MutationCtx,
  self: string,
  token: string,
) {
  const existing = await findToken(ctx, self, token);
  if (existing === null) {
    await ctx.db.insert("pushTokens", { accountId: self, token });
  }
  return null;
}

export async function unregisterPushToken(
  ctx: MutationCtx,
  self: string,
  token: string,
) {
  const existing = await findToken(ctx, self, token);
  if (existing !== null) await ctx.db.delete(existing._id);
  return null;
}

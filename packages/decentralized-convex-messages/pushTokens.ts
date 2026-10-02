import type { MutationCtx } from "./_generated/server.js";

function findToken(ctx: MutationCtx, token: string) {
  return ctx.db
    .query("pushTokens")
    .withIndex("by_token", (index) => index.eq("token", token))
    .unique();
}

export async function registerPushToken(
  ctx: MutationCtx,
  self: string,
  token: string,
) {
  const existing = await findToken(ctx, token);
  if (existing === null) {
    await ctx.db.insert("pushTokens", { accountId: self, token });
  } else if (existing.accountId !== self) {
    // The device signed into a different account.
    await ctx.db.patch(existing._id, { accountId: self });
  }
  return null;
}

export async function unregisterPushToken(
  ctx: MutationCtx,
  self: string,
  token: string,
) {
  const existing = await findToken(ctx, token);
  if (existing?.accountId === self) await ctx.db.delete(existing._id);
  return null;
}

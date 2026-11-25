import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";

// When an owner removes someone from a space, every invite link that
// existed then stops working for them. Links made afterwards still do,
// and joining any way clears the record. Leaving on your own makes none.

function getRemoval(ctx: QueryCtx, spaceId: string, accountId: string) {
  return ctx.db
    .query("spaceRemovals")
    .withIndex("by_space_account", (index) =>
      index.eq("spaceId", spaceId).eq("accountId", accountId),
    )
    .unique();
}

/** Clears the account's removal from a space, if it has one. */
export async function forgetRemoval(
  ctx: MutationCtx,
  spaceId: string,
  accountId: string,
) {
  const removal = await getRemoval(ctx, spaceId, accountId);
  if (removal !== null) await ctx.db.delete(removal._id);
}

/** Notes that an owner removed the account just now. */
export async function noteRemoval(
  ctx: MutationCtx,
  spaceId: string,
  accountId: string,
) {
  // A fresh row, so its creation time is this removal's.
  await forgetRemoval(ctx, spaceId, accountId);
  await ctx.db.insert("spaceRemovals", { accountId, spaceId });
}

/**
 * Whether the link was made before the account was last removed from its
 * space. Both times come from the database, so they compare exactly.
 */
export async function isLinkRevokedFor(
  ctx: QueryCtx,
  link: Doc<"spaceInviteLinks">,
  accountId: string,
) {
  const removal = await getRemoval(ctx, link.spaceId, accountId);
  return removal !== null && link._creationTime <= removal._creationTime;
}

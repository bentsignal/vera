import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { getSpace, getSpaceMember } from "./spaceReads.ts";
import { forgetRemoval } from "./spaceRemovals.ts";

// Space invitations: those still waiting for an answer, and clearing one.

/**
 * Clears what an account joining a space settles: its invitation, if it has
 * one, and an owner's earlier removal of it (spaceRemovals.ts).
 */
export async function clearOnJoin(
  ctx: MutationCtx,
  spaceId: string,
  accountId: string,
) {
  const invite = await ctx.db
    .query("spaceInvites")
    .withIndex("by_space_account", (index) =>
      index.eq("spaceId", spaceId).eq("accountId", accountId),
    )
    .unique();
  if (invite !== null) await ctx.db.delete(invite._id);
  await forgetRemoval(ctx, spaceId, accountId);
}

/**
 * The account's invitations to spaces that still exist, with the space.
 * One to a space it's in already (added by a member after being invited)
 * isn't pending: there's nothing to answer, and it would count on the
 * badge for good.
 */
export async function pendingInvites(ctx: QueryCtx, accountId: string) {
  const invites = await ctx.db
    .query("spaceInvites")
    .withIndex("by_account", (index) => index.eq("accountId", accountId))
    .collect();
  const pending = [];
  for (const invite of invites) {
    const [space, member] = await Promise.all([
      getSpace(ctx, invite.spaceId),
      getSpaceMember(ctx, invite.spaceId, accountId),
    ]);
    if (space !== null && member === null) pending.push({ invite, space });
  }
  return pending;
}

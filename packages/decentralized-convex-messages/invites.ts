import type { OperationArgs } from "@decentralized-convex/plugin";

import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type {
  messagesProtocol,
  SpaceInvite,
  SpaceInviteLink,
} from "./protocol.ts";
import { internal } from "./_generated/api.js";
import {
  fail,
  getSpace,
  getSpaceMember,
  normalizeMembers,
  pendingInvites,
} from "./model.ts";
import { MAX_INVITE_LINK_LIFETIME } from "./protocol.ts";
import { requireSpaceRole } from "./spaces.ts";

type Mutations = (typeof messagesProtocol)["mutations"];
type Args<Operation extends keyof Mutations> = OperationArgs<
  Mutations[Operation]
>;

// Letters and digits that can't be mistaken for one another when read aloud
// or retyped: no 0/O, 1/l/I.
const CODE_ALPHABET =
  "23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 10;

function getInvite(ctx: QueryCtx, spaceId: string, accountId: string) {
  return ctx.db
    .query("spaceInvites")
    .withIndex("by_space_account", (index) =>
      index.eq("spaceId", spaceId).eq("accountId", accountId),
    )
    .unique();
}

function getLink(ctx: QueryCtx, code: string) {
  return ctx.db
    .query("spaceInviteLinks")
    .withIndex("by_code", (index) => index.eq("code", code))
    .unique();
}

function isExpired(link: Doc<"spaceInviteLinks">, now = Date.now()) {
  return link.expiresAt !== undefined && link.expiresAt <= now;
}

function memberCount(ctx: QueryCtx, spaceId: string) {
  return ctx.db
    .query("spaceMembers")
    .withIndex("by_space_account", (index) => index.eq("spaceId", spaceId))
    .collect()
    .then((members) => members.length);
}

/** Adds the caller to a space and clears their invitation to it, if any. */
async function join(ctx: MutationCtx, spaceId: string, self: string) {
  if ((await getSpaceMember(ctx, spaceId, self)) === null) {
    await ctx.db.insert("spaceMembers", {
      accountId: self,
      role: "member",
      spaceId,
    });
  }
  const invite = await getInvite(ctx, spaceId, self);
  if (invite !== null) await ctx.db.delete(invite._id);
}

export async function inviteToSpace(
  ctx: MutationCtx,
  self: string,
  args: Args<"inviteToSpace">,
) {
  await requireSpaceRole(ctx, args.spaceId, self, "member");
  const invited: string[] = [];
  for (const accountId of normalizeMembers(args.members, self)) {
    const isMember =
      (await getSpaceMember(ctx, args.spaceId, accountId)) !== null;
    const isInvited = (await getInvite(ctx, args.spaceId, accountId)) !== null;
    if (isMember || isInvited) continue;
    await ctx.db.insert("spaceInvites", {
      accountId,
      invitedBy: self,
      spaceId: args.spaceId,
    });
    invited.push(accountId);
  }
  if (invited.length > 0) {
    await ctx.scheduler.runAfter(0, internal.notifications.sendInvite, {
      accountIds: invited,
      invitedBy: self,
      spaceId: args.spaceId,
    });
  }
  return null;
}

export async function acceptSpaceInvite(
  ctx: MutationCtx,
  self: string,
  args: Args<"acceptSpaceInvite">,
) {
  const invite = await getInvite(ctx, args.spaceId, self);
  if (invite === null || (await getSpace(ctx, args.spaceId)) === null) {
    fail("SPACE_INVITE_NOT_FOUND");
  }
  await join(ctx, args.spaceId, self);
  return null;
}

export async function declineSpaceInvite(
  ctx: MutationCtx,
  self: string,
  args: Args<"declineSpaceInvite">,
) {
  const invite = await getInvite(ctx, args.spaceId, self);
  if (invite !== null) await ctx.db.delete(invite._id);
  return null;
}

export async function spaceInvites(ctx: QueryCtx, self: string) {
  const result: SpaceInvite[] = [];
  for (const { invite, space } of await pendingInvites(ctx, self)) {
    result.push({
      invitedAt: invite._creationTime,
      invitedBy: invite.invitedBy,
      memberCount: await memberCount(ctx, invite.spaceId),
      name: space.name,
      spaceId: invite.spaceId,
    });
  }
  return result.sort((left, right) => right.invitedAt - left.invitedAt);
}

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(
    bytes,
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  ).join("");
}

function toLink(link: Doc<"spaceInviteLinks">): SpaceInviteLink {
  return {
    code: link.code,
    createdAt: link._creationTime,
    createdBy: link.createdBy,
    expiresAt: link.expiresAt ?? null,
  };
}

export async function createSpaceInviteLink(
  ctx: MutationCtx,
  self: string,
  args: Args<"createSpaceInviteLink">,
) {
  await requireSpaceRole(ctx, args.spaceId, self, "member");
  const { expiresIn } = args;
  if (
    expiresIn !== undefined &&
    !(expiresIn > 0 && expiresIn <= MAX_INVITE_LINK_LIFETIME)
  ) {
    fail("INVALID_EXPIRATION");
  }
  // Expired links are only ever read to be refused, so clear them out.
  const now = Date.now();
  const links = await ctx.db
    .query("spaceInviteLinks")
    .withIndex("by_space", (index) => index.eq("spaceId", args.spaceId))
    .collect();
  for (const link of links) {
    if (isExpired(link, now)) await ctx.db.delete(link._id);
  }
  let code = newCode();
  while ((await getLink(ctx, code)) !== null) code = newCode();
  const expiresAt = expiresIn === undefined ? undefined : now + expiresIn;
  await ctx.db.insert("spaceInviteLinks", {
    code,
    createdBy: self,
    expiresAt,
    spaceId: args.spaceId,
  });
  return {
    code,
    createdAt: now,
    createdBy: self,
    expiresAt: expiresAt ?? null,
  } satisfies SpaceInviteLink;
}

export async function revokeSpaceInviteLink(
  ctx: MutationCtx,
  self: string,
  args: Args<"revokeSpaceInviteLink">,
) {
  const link = await getLink(ctx, args.code);
  if (link === null) return null;
  await requireSpaceRole(
    ctx,
    link.spaceId,
    self,
    link.createdBy === self ? "member" : "owner",
  );
  await ctx.db.delete(link._id);
  return null;
}

export async function spaceInviteLinks(
  ctx: QueryCtx,
  self: string,
  spaceId: string,
) {
  const { member } = await requireSpaceRole(ctx, spaceId, self, "member");
  const links = await ctx.db
    .query("spaceInviteLinks")
    .withIndex("by_space", (index) => index.eq("spaceId", spaceId))
    .collect();
  const now = Date.now();
  return links
    .filter(
      (link) =>
        !isExpired(link, now) &&
        (member.role === "owner" || link.createdBy === self),
    )
    .map(toLink)
    .sort((left, right) => right.createdAt - left.createdAt);
}

export async function spaceInviteLinkPreview(
  ctx: QueryCtx,
  self: string,
  code: string,
) {
  const link = await getLink(ctx, code);
  if (link === null || isExpired(link)) return null;
  const space = await getSpace(ctx, link.spaceId);
  if (space === null) return null;
  return {
    expiresAt: link.expiresAt ?? null,
    isMember: (await getSpaceMember(ctx, link.spaceId, self)) !== null,
    memberCount: await memberCount(ctx, link.spaceId),
    name: space.name,
    spaceId: link.spaceId,
  };
}

export async function joinSpaceWithLink(
  ctx: MutationCtx,
  self: string,
  args: Args<"joinSpaceWithLink">,
) {
  const link = await getLink(ctx, args.code);
  if (link === null || (await getSpace(ctx, link.spaceId)) === null) {
    fail("SPACE_INVITE_LINK_NOT_FOUND");
  }
  if (isExpired(link)) fail("SPACE_INVITE_LINK_EXPIRED");
  await join(ctx, link.spaceId, self);
  return { spaceId: link.spaceId };
}

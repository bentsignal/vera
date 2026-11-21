import type { OperationArgs } from "@decentralized-convex/plugin";

import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { messagesProtocol } from "./protocol.ts";
import { upsertEntry } from "./inboxEntries.ts";
import {
  scheduleChannelEntries,
  scheduleForget,
  scheduleJoin,
  scheduleLeave,
} from "./inboxMembers.ts";
import {
  fail,
  getConversation,
  getSpace,
  getSpaceMember,
  isRetriedCreate,
  newId,
  normalizeAddress,
  normalizeMembers,
  normalizeName,
  requireSpaceRole,
} from "./model.ts";
import { channelName } from "./naming.ts";
import { clearOnJoin } from "./pendingInvites.ts";
import { forgetBadge } from "./pushBadges.ts";
import { noteRemoval } from "./spaceRemovals.ts";
import { deleteThreads } from "./threads.ts";

type Mutations = (typeof messagesProtocol)["mutations"];
type Args<Operation extends keyof Mutations> = OperationArgs<
  Mutations[Operation]
>;

function normalizeChannelName(value: string) {
  return normalizeName(channelName(value));
}

async function requireChannelOwner(
  ctx: QueryCtx,
  conversationId: string,
  self: string,
) {
  const channel = await getConversation(ctx, conversationId);
  if (channel?.kind !== "channel" || channel.spaceId === undefined) {
    fail("CHANNEL_NOT_FOUND");
  }
  await requireSpaceRole(ctx, channel.spaceId, self, "owner");
  return channel;
}

/** Creates a space owned by the caller, with a #general channel. */
export async function createSpace(
  ctx: MutationCtx,
  self: string,
  args: Args<"createSpace">,
) {
  const spaceId = newId("space", self, args.spaceId);
  const generalId = newId("channel", self, args.generalChannelId);
  if (isRetriedCreate(await getSpace(ctx, spaceId), self, () => true)) {
    return { spaceId };
  }
  if ((await getConversation(ctx, generalId)) !== null) fail("ID_TAKEN");
  await ctx.db.insert("spaces", {
    createdBy: self,
    name: normalizeName(args.name),
    spaceId,
  });
  await ctx.db.insert("spaceMembers", {
    accountId: self,
    role: "owner",
    spaceId,
  });
  const id = await ctx.db.insert("conversations", {
    conversationId: generalId,
    createdBy: self,
    kind: "channel",
    name: "general",
    position: 0,
    spaceId,
    updatedAt: Date.now(),
  });
  const general = await ctx.db.get(id);
  if (general !== null) {
    await upsertEntry(ctx, self, general, { activityAt: general.updatedAt });
  }
  return { spaceId };
}

export async function renameSpace(
  ctx: MutationCtx,
  self: string,
  args: Args<"renameSpace">,
) {
  const { space } = await requireSpaceRole(ctx, args.spaceId, self, "owner");
  await ctx.db.patch(space._id, { name: normalizeName(args.name) });
  return null;
}

/** Adds people without asking; see `inviteToSpace` for invitations. */
export async function addSpaceMembers(
  ctx: MutationCtx,
  self: string,
  args: Args<"addSpaceMembers">,
) {
  await requireSpaceRole(ctx, args.spaceId, self, "member");
  for (const accountId of normalizeMembers(args.members, self)) {
    if ((await getSpaceMember(ctx, args.spaceId, accountId)) === null) {
      await ctx.db.insert("spaceMembers", {
        accountId,
        role: "member",
        spaceId: args.spaceId,
      });
      await scheduleJoin(ctx, args.spaceId, accountId);
    }
    // In the space, they've nothing left to answer.
    await clearOnJoin(ctx, args.spaceId, accountId);
  }
  return null;
}

/**
 * Anyone may leave; only owners remove others. Owners cannot leave.
 * Someone removed can't rejoin with a link made before (spaceRemovals.ts).
 */
export async function removeSpaceMember(
  ctx: MutationCtx,
  self: string,
  args: Args<"removeSpaceMember">,
) {
  const target = normalizeAddress(args.accountId);
  // Their badge stops counting the space's channels.
  await forgetBadge(ctx, target);
  const { member } = await requireSpaceRole(
    ctx,
    args.spaceId,
    self,
    target === self ? "member" : "owner",
  );
  const removed =
    target === self ? member : await getSpaceMember(ctx, args.spaceId, target);
  if (removed === null) return null;
  if (removed.role === "owner") fail("SPACE_OWNER_CANNOT_LEAVE");
  await ctx.db.delete(removed._id);
  if (target !== self) await noteRemoval(ctx, args.spaceId, target);
  await scheduleLeave(ctx, args.spaceId, removed.accountId);
  return null;
}

export async function createChannel(
  ctx: MutationCtx,
  self: string,
  args: Args<"createChannel">,
) {
  await requireSpaceRole(ctx, args.spaceId, self, "owner");
  const conversationId = newId("channel", self, args.conversationId);
  const existing = await getConversation(ctx, conversationId);
  if (
    isRetriedCreate(
      existing,
      self,
      ({ kind, spaceId }) => kind === "channel" && spaceId === args.spaceId,
    )
  ) {
    return { conversationId };
  }
  // The last by position (from before positions, none counts as 0).
  const last = await ctx.db
    .query("conversations")
    .withIndex("by_space_position", (index) =>
      index.eq("spaceId", args.spaceId),
    )
    .order("desc")
    .first();
  await ctx.db.insert("conversations", {
    conversationId,
    createdBy: self,
    kind: "channel",
    name: normalizeChannelName(args.name),
    position: (last?.position ?? -1) + 1,
    spaceId: args.spaceId,
    updatedAt: Date.now(),
  });
  await scheduleChannelEntries(ctx, conversationId);
  return { conversationId };
}

export async function renameChannel(
  ctx: MutationCtx,
  self: string,
  args: Args<"renameChannel">,
) {
  const channel = await requireChannelOwner(ctx, args.conversationId, self);
  await ctx.db.patch(channel._id, { name: normalizeChannelName(args.name) });
  return null;
}

export async function deleteChannel(
  ctx: MutationCtx,
  self: string,
  args: Args<"deleteChannel">,
) {
  const channel = await requireChannelOwner(ctx, args.conversationId, self);
  const { conversationId } = channel;
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversation_sent", (index) =>
      index.eq("conversationId", conversationId),
    )
    .collect();
  const members = await ctx.db
    .query("members")
    .withIndex("by_conversation_account", (index) =>
      index.eq("conversationId", conversationId),
    )
    .collect();
  for (const row of [...messages, ...members]) await ctx.db.delete(row._id);
  await deleteThreads(ctx, conversationId);
  await ctx.db.delete(channel._id);
  await scheduleForget(ctx, conversationId);
  return null;
}

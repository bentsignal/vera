import type { OperationArgs } from "@decentralized-convex/plugin";

import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { messagesProtocol, Space } from "./protocol.ts";
import {
  fail,
  getConversation,
  getMember,
  getSpace,
  getSpaceMember,
  isRetriedCreate,
  newId,
  normalizeAddress,
  normalizeMembers,
  normalizeName,
  unreadCount,
} from "./model.ts";
import { channelName } from "./naming.ts";

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
  await ctx.db.insert("conversations", {
    conversationId: generalId,
    createdBy: self,
    kind: "channel",
    name: "general",
    position: 0,
    spaceId,
    updatedAt: Date.now(),
  });
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
    }
  }
  return null;
}

/** Anyone may leave; only owners remove others. Owners cannot leave. */
export async function removeSpaceMember(
  ctx: MutationCtx,
  self: string,
  args: Args<"removeSpaceMember">,
) {
  const target = normalizeAddress(args.accountId);
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
  const channels = await ctx.db
    .query("conversations")
    .withIndex("by_space", (index) => index.eq("spaceId", args.spaceId))
    .collect();
  await ctx.db.insert("conversations", {
    conversationId,
    createdBy: self,
    kind: "channel",
    name: normalizeChannelName(args.name),
    position:
      Math.max(-1, ...channels.map(({ position }) => position ?? 0)) + 1,
    spaceId: args.spaceId,
    updatedAt: Date.now(),
  });
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
  await ctx.db.delete(channel._id);
  return null;
}

export async function spaces(ctx: QueryCtx, self: string) {
  const memberships = await ctx.db
    .query("spaceMembers")
    .withIndex("by_account", (index) => index.eq("accountId", self))
    .collect();
  const found = await Promise.all(
    memberships.map(async ({ spaceId }) => {
      const space = await getSpace(ctx, spaceId);
      return space === null ? null : toSpace(ctx, space, self);
    }),
  );
  return found
    .filter((space) => space !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function space(ctx: QueryCtx, self: string, spaceId: string) {
  const found = await getSpace(ctx, spaceId);
  return found === null ? null : toSpace(ctx, found, self);
}

export async function toSpace(
  ctx: QueryCtx,
  space: Doc<"spaces">,
  accountId: string,
): Promise<Space | null> {
  const self = await getSpaceMember(ctx, space.spaceId, accountId);
  if (self === null) return null;
  const [members, invites, conversations] = await Promise.all([
    ctx.db
      .query("spaceMembers")
      .withIndex("by_space_account", (index) =>
        index.eq("spaceId", space.spaceId),
      )
      .collect(),
    ctx.db
      .query("spaceInvites")
      .withIndex("by_space_account", (index) =>
        index.eq("spaceId", space.spaceId),
      )
      .collect(),
    ctx.db
      .query("conversations")
      .withIndex("by_space", (index) => index.eq("spaceId", space.spaceId))
      .collect(),
  ]);
  const channels = await Promise.all(
    conversations.map(async (conversation) => {
      const member = await getMember(
        ctx,
        conversation.conversationId,
        accountId,
      );
      return {
        conversationId: conversation.conversationId,
        name: conversation.name ?? "",
        position: conversation.position ?? 0,
        showInInbox: member?.hiddenFromInbox !== true,
        unreadCount: await unreadCount(
          ctx,
          conversation.conversationId,
          accountId,
          member?.lastReadAt ?? self._creationTime,
        ),
      };
    }),
  );
  channels.sort(
    (left, right) =>
      left.position - right.position || left.name.localeCompare(right.name),
  );
  return {
    channels,
    invited: invites.map((invite) => invite.accountId),
    members: members.map((member) => ({
      accountId: member.accountId,
      role: member.role,
    })),
    name: space.name,
    role: self.role,
    spaceId: space.spaceId,
    unreadCount: channels.reduce(
      (total, channel) => total + channel.unreadCount,
      0,
    ),
  };
}

export async function requireSpaceRole(
  ctx: QueryCtx,
  spaceId: string,
  accountId: string,
  role: "member" | "owner",
) {
  const space = await getSpace(ctx, spaceId);
  const member =
    space === null ? null : await getSpaceMember(ctx, spaceId, accountId);
  if (space === null || member === null) fail("SPACE_NOT_FOUND");
  if (role === "owner" && member.role !== "owner") fail("SPACE_OWNER_REQUIRED");
  return { member, space };
}

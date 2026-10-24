import type { OperationArgs } from "@decentralized-convex/plugin";

import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { MessagePage } from "./paging.ts";
import type { messagesProtocol } from "./protocol.ts";
import { alertsFor } from "./alerts.ts";
import {
  fail,
  findAccess,
  getConversation,
  isRetriedCreate,
  memberAddresses,
  newId,
  normalizeAddress,
  normalizeMembers,
  normalizeName,
  optionalName,
  requireAccess,
  toConversation,
  toMessage,
} from "./model.ts";
import { directConversationId } from "./naming.ts";
import { around, pageOf } from "./paging.ts";
import { markReadUpTo } from "./readStates.ts";
import { notificationSettings } from "./settings.ts";
import { MAX_MEMBER_EVENTS } from "./shapes.ts";
import { seeConversationActivity } from "./sightings.ts";

type Mutations = (typeof messagesProtocol)["mutations"];
type Queries = (typeof messagesProtocol)["queries"];
type Args<Operation extends keyof Mutations> = OperationArgs<
  Mutations[Operation]
>;

const MAX_GROUP_MEMBERS = 50;

async function insertMembers(
  ctx: MutationCtx,
  conversationId: string,
  members: readonly string[],
  owner?: string,
) {
  const now = Date.now();
  for (const accountId of members) {
    await ctx.db.insert("members", {
      accountId,
      conversationId,
      lastReadAt: now,
      muted: false,
      role: accountId === owner ? "owner" : "member",
    });
  }
}

export async function openDirect(
  ctx: MutationCtx,
  self: string,
  args: Args<"openDirect">,
) {
  const other = normalizeAddress(args.accountId);
  if (other === self) fail("INVALID_ADDRESS");
  const conversationId = directConversationId(self, other);
  if ((await getConversation(ctx, conversationId)) === null) {
    await ctx.db.insert("conversations", {
      conversationId,
      createdBy: self,
      kind: "direct",
      updatedAt: Date.now(),
    });
    await insertMembers(ctx, conversationId, [self, other]);
  }
  return { conversationId };
}

export async function createGroup(
  ctx: MutationCtx,
  self: string,
  args: Args<"createGroup">,
) {
  const members = normalizeMembers(args.members, self);
  if (members.length === 0 || members.length >= MAX_GROUP_MEMBERS) {
    fail("INVALID_GROUP_MEMBERS");
  }
  const conversationId = newId("group", self, args.conversationId);
  const existing = await getConversation(ctx, conversationId);
  if (isRetriedCreate(existing, self, ({ kind }) => kind === "group")) {
    return { conversationId };
  }
  await ctx.db.insert("conversations", {
    conversationId,
    createdBy: self,
    kind: "group",
    // Groups without a name are titled with their members' names.
    name: optionalName(args.name),
    updatedAt: Date.now(),
  });
  await insertMembers(ctx, conversationId, [self, ...members], self);
  return { conversationId };
}

async function requireGroup(
  ctx: QueryCtx,
  conversationId: string,
  self: string,
) {
  const access = await requireAccess(ctx, conversationId, self);
  if (access.conversation.kind !== "group") fail("GROUP_REQUIRED");
  return access;
}

export async function renameGroup(
  ctx: MutationCtx,
  self: string,
  args: Args<"renameGroup">,
) {
  const { conversation } = await requireGroup(ctx, args.conversationId, self);
  await ctx.db.patch(conversation._id, { name: normalizeName(args.name) });
  return null;
}

export async function addGroupMembers(
  ctx: MutationCtx,
  self: string,
  args: Args<"addGroupMembers">,
) {
  const { conversation } = await requireGroup(ctx, args.conversationId, self);
  const existing = new Set(await memberAddresses(ctx, conversation));
  const added = normalizeMembers(args.members, self).filter(
    (accountId) => !existing.has(accountId),
  );
  if (existing.size + added.length > MAX_GROUP_MEMBERS) {
    fail("INVALID_GROUP_MEMBERS");
  }
  const { conversationId } = conversation;
  await insertMembers(ctx, conversationId, added);
  const at = Date.now();
  for (const accountId of added) {
    await ctx.db.insert("memberEvents", {
      accountId,
      at,
      by: self,
      conversationId,
      kind: "joined",
    });
  }
  return null;
}

export async function leaveConversation(
  ctx: MutationCtx,
  self: string,
  args: Args<"leaveConversation">,
) {
  const { member } = await requireGroup(ctx, args.conversationId, self);
  if (member !== null) {
    await ctx.db.delete(member._id);
    await ctx.db.insert("memberEvents", {
      accountId: self,
      at: Date.now(),
      conversationId: args.conversationId,
      kind: "left",
    });
  }
  return null;
}

/** A group's joins and leaves, oldest first (see the protocol). */
export async function memberEvents(
  ctx: QueryCtx,
  self: string,
  args: OperationArgs<Queries["memberEvents"]>,
) {
  const { conversationId } = args;
  const { conversation: found } = await requireAccess(
    ctx,
    conversationId,
    self,
  );
  if (found.kind !== "group") return [];
  const events = await ctx.db
    .query("memberEvents")
    .withIndex("by_conversation_at", (index) =>
      index.eq("conversationId", conversationId),
    )
    .order("desc")
    .take(MAX_MEMBER_EVENTS);
  return events.reverse().map(({ _id, accountId, at, by, kind }) => ({
    accountId,
    at,
    ...(by === undefined ? {} : { by }),
    eventId: _id,
    kind,
  }));
}

export async function markRead(
  ctx: MutationCtx,
  self: string,
  args: Args<"markRead">,
) {
  const access = await requireAccess(ctx, args.conversationId, self);
  const readAt = Math.min(args.readAt, Date.now());
  await markReadUpTo(ctx, access, self, readAt);
  // Reading a conversation sees its activity too.
  await seeConversationActivity(ctx, self, args.conversationId, readAt);
  return null;
}

export async function conversation(
  ctx: QueryCtx,
  self: string,
  args: OperationArgs<Queries["conversation"]>,
) {
  const access = await findAccess(ctx, args.conversationId, self);
  if (access === null) return null;
  const settings = await notificationSettings(ctx, self);
  return toConversation(ctx, access, self, alertsFor(access, settings));
}

/** One page of messages, oldest first, by whichever cursor was given. */
export async function list(
  ctx: QueryCtx,
  self: string,
  args: OperationArgs<Queries["list"]>,
) {
  const { conversation: found } = await requireAccess(
    ctx,
    args.conversationId,
    self,
  );
  const { around: anchor, conversationId } = args;
  async function load(): Promise<MessagePage> {
    if (anchor === undefined) return pageOf(ctx, { conversationId }, args);
    const centered = await around(ctx, conversationId, anchor);
    if (centered === null) fail("MESSAGE_NOT_FOUND");
    return centered;
  }
  const [page, routes] = await Promise.all([
    load(),
    memberAddresses(ctx, found),
  ]);
  return { page: { ...page, messages: page.messages.map(toMessage) }, routes };
}

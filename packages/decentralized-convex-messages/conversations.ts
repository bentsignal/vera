import type { OperationArgs } from "@decentralized-convex/plugin";

import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { Attachment, messagesProtocol } from "./protocol.ts";
import { internal } from "./_generated/api.js";
import {
  directConversationId,
  fail,
  findAccess,
  getConversation,
  memberAddresses,
  newId,
  normalizeAddress,
  normalizeMembers,
  normalizeName,
  requireAccess,
  toConversation,
  toMessage,
  upsertMember,
} from "./model.ts";
import { MESSAGE_PAGE_SIZE } from "./protocol.ts";

type Mutations = (typeof messagesProtocol)["mutations"];
type Queries = (typeof messagesProtocol)["queries"];
type Args<Operation extends keyof Mutations> = OperationArgs<
  Mutations[Operation]
>;

const MAX_BODY_LENGTH = 4_000;
const MAX_ATTACHMENTS = 10;
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
  const conversationId = newId("group", self);
  await ctx.db.insert("conversations", {
    conversationId,
    createdBy: self,
    kind: "group",
    name: normalizeName(args.name),
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
  await insertMembers(ctx, conversation.conversationId, added);
  return null;
}

export async function leaveConversation(
  ctx: MutationCtx,
  self: string,
  args: Args<"leaveConversation">,
) {
  const { member } = await requireGroup(ctx, args.conversationId, self);
  if (member !== null) await ctx.db.delete(member._id);
  return null;
}

export async function send(
  ctx: MutationCtx,
  self: string,
  authorName: string,
  args: Args<"send">,
) {
  const access = await requireAccess(ctx, args.conversationId, self);
  const body = args.body.trim();
  validateMessage(body, args.attachments);

  const existing = await ctx.db
    .query("messages")
    .withIndex("by_message", (index) => index.eq("messageId", args.messageId))
    .unique();
  if (existing !== null) {
    // A retried send returns the original; another author's ID is taken.
    if (existing.authorId !== self) fail("MESSAGE_ID_TAKEN");
    return toMessage(existing);
  }

  const sentAt = Date.now();
  const message = {
    attachments: args.attachments,
    authorId: self,
    authorName,
    body,
    conversationId: args.conversationId,
    messageId: args.messageId,
    sentAt,
  };
  await ctx.db.insert("messages", message);
  await ctx.db.patch(access.conversation._id, { updatedAt: sentAt });
  await upsertMember(ctx, access, self, { lastReadAt: sentAt });
  await ctx.scheduler.runAfter(0, internal.notifications.send, {
    messageId: args.messageId,
  });
  if (/https?:\/\//i.test(body)) {
    await ctx.scheduler.runAfter(0, internal.previews.unfurl, {
      messageId: args.messageId,
    });
  }
  return { ...message, linkPreview: null };
}

export async function markRead(
  ctx: MutationCtx,
  self: string,
  args: Args<"markRead">,
) {
  const access = await requireAccess(ctx, args.conversationId, self);
  const readAt = Math.min(args.readAt, Date.now());
  if (readAt > access.lastReadAt) {
    await upsertMember(ctx, access, self, { lastReadAt: readAt });
  }
  return null;
}

export async function setMuted(
  ctx: MutationCtx,
  self: string,
  args: Args<"setMuted">,
) {
  const access = await requireAccess(ctx, args.conversationId, self);
  await upsertMember(ctx, access, self, { muted: args.muted });
  return null;
}

export async function inbox(ctx: QueryCtx, self: string) {
  const memberships = await ctx.db
    .query("members")
    .withIndex("by_account", (index) => index.eq("accountId", self))
    .collect();
  const conversations = [];
  for (const membership of memberships) {
    const access = await findAccess(ctx, membership.conversationId, self);
    if (access === null || access.conversation.kind === "channel") continue;
    conversations.push(await toConversation(ctx, access, self));
  }
  return conversations.sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function conversation(
  ctx: QueryCtx,
  self: string,
  args: OperationArgs<Queries["conversation"]>,
) {
  const access = await findAccess(ctx, args.conversationId, self);
  return access === null ? null : toConversation(ctx, access, self);
}

/** One page of messages, newest first, for inverted message lists. */
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
  const { before, conversationId } = args;
  const page = await ctx.db
    .query("messages")
    .withIndex("by_conversation_sent", (index) =>
      before === undefined
        ? index.eq("conversationId", conversationId)
        : index.eq("conversationId", conversationId).lt("sentAt", before),
    )
    .order("desc")
    .take(MESSAGE_PAGE_SIZE + 1);
  return {
    page: {
      hasMore: page.length > MESSAGE_PAGE_SIZE,
      messages: page.slice(0, MESSAGE_PAGE_SIZE).map(toMessage),
    },
    routes: await memberAddresses(ctx, found),
  };
}

function validateMessage(body: string, attachments: readonly Attachment[]) {
  if (body.length === 0 && attachments.length === 0) fail("EMPTY_MESSAGE");
  if (body.length > MAX_BODY_LENGTH) fail("INVALID_MESSAGE_BODY");
  if (attachments.length > MAX_ATTACHMENTS) fail("TOO_MANY_ATTACHMENTS");
  const urls = attachments.flatMap((attachment) =>
    attachment.thumbnailUrl === undefined
      ? [attachment.url]
      : [attachment.url, attachment.thumbnailUrl],
  );
  if (!urls.every(isHttpsUrl)) fail("INVALID_ATTACHMENT");
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

import { ConvexError } from "convex/values";

import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { Conversation, Message } from "./protocol.ts";

const ADDRESS_PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const MAX_NAME_LENGTH = 80;
const MAX_UNREAD = 99;

export function fail(code: string): never {
  throw new ConvexError({ code });
}

export function requireAccountId(
  identity: null | { accountId?: string; email?: string },
) {
  const accountId = (identity?.accountId ?? identity?.email)
    ?.trim()
    .toLowerCase();
  if (accountId?.includes("@") !== true) fail("AUTHENTICATED_ACCOUNT_REQUIRED");
  return accountId;
}

export function normalizeAddress(value: string) {
  const address = value.trim().toLowerCase();
  if (!ADDRESS_PATTERN.test(address)) fail("INVALID_ADDRESS");
  return address;
}

/** Normalizes, de-duplicates, and drops the caller from a member list. */
export function normalizeMembers(values: readonly string[], self: string) {
  return [...new Set(values.map(normalizeAddress))].filter(
    (address) => address !== self,
  );
}

export function normalizeName(value: string) {
  const name = value.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) fail("INVALID_NAME");
  return name;
}

/** New group, space, and channel IDs name the creator's home domain. */
export function newId(kind: string, accountId: string) {
  const domain = accountId.slice(accountId.lastIndexOf("@") + 1);
  return `${kind}:${domain}:${crypto.randomUUID()}`;
}

export function directConversationId(left: string, right: string) {
  return `direct:${[left, right].sort().join(":")}`;
}

export function getConversation(ctx: QueryCtx, conversationId: string) {
  return ctx.db
    .query("conversations")
    .withIndex("by_conversation", (index) =>
      index.eq("conversationId", conversationId),
    )
    .unique();
}

export function getMember(
  ctx: QueryCtx,
  conversationId: string,
  accountId: string,
) {
  return ctx.db
    .query("members")
    .withIndex("by_conversation_account", (index) =>
      index.eq("conversationId", conversationId).eq("accountId", accountId),
    )
    .unique();
}

export function getSpace(ctx: QueryCtx, spaceId: string) {
  return ctx.db
    .query("spaces")
    .withIndex("by_space", (index) => index.eq("spaceId", spaceId))
    .unique();
}

export function getSpaceMember(
  ctx: QueryCtx,
  spaceId: string,
  accountId: string,
) {
  return ctx.db
    .query("spaceMembers")
    .withIndex("by_space_account", (index) =>
      index.eq("spaceId", spaceId).eq("accountId", accountId),
    )
    .unique();
}

/** The account's invitations to spaces that still exist, with the space. */
export async function pendingInvites(ctx: QueryCtx, accountId: string) {
  const invites = await ctx.db
    .query("spaceInvites")
    .withIndex("by_account", (index) => index.eq("accountId", accountId))
    .collect();
  const pending = [];
  for (const invite of invites) {
    const space = await getSpace(ctx, invite.spaceId);
    if (space !== null) pending.push({ invite, space });
  }
  return pending;
}

export interface ConversationAccess {
  readonly conversation: Doc<"conversations">;
  readonly lastReadAt: number;
  readonly member: Doc<"members"> | null;
  readonly muted: boolean;
}

/**
 * Returns the caller's access to a conversation, or null when the
 * conversation does not exist or the caller is not a member. Channel access
 * comes from space membership.
 */
export async function findAccess(
  ctx: QueryCtx,
  conversationId: string,
  accountId: string,
): Promise<ConversationAccess | null> {
  const conversation = await getConversation(ctx, conversationId);
  if (conversation === null) return null;
  const member = await getMember(ctx, conversationId, accountId);
  if (conversation.kind !== "channel") {
    return member === null
      ? null
      : {
          conversation,
          lastReadAt: member.lastReadAt,
          member,
          muted: member.muted,
        };
  }
  const spaceMember =
    conversation.spaceId === undefined
      ? null
      : await getSpaceMember(ctx, conversation.spaceId, accountId);
  if (spaceMember === null) return null;
  return {
    conversation,
    // Space members start with everything before they joined marked read.
    lastReadAt: member?.lastReadAt ?? spaceMember._creationTime,
    member,
    muted: member?.muted ?? false,
  };
}

export async function requireAccess(
  ctx: QueryCtx,
  conversationId: string,
  accountId: string,
) {
  const access = await findAccess(ctx, conversationId, accountId);
  if (access === null) fail("CONVERSATION_NOT_FOUND");
  return access;
}

/** Channel read state is stored lazily, so create the row on first write. */
export async function upsertMember(
  ctx: MutationCtx,
  access: ConversationAccess,
  accountId: string,
  patch: Partial<
    Pick<
      Doc<"members">,
      "hiddenFromInbox" | "lastReadAt" | "muted" | "pinnedAt"
    >
  >,
) {
  if (access.member !== null) {
    // An undefined value removes the field (unpinned, back in the inbox).
    await ctx.db.patch(access.member._id, patch);
    return;
  }
  await ctx.db.insert("members", {
    accountId,
    conversationId: access.conversation.conversationId,
    hiddenFromInbox: patch.hiddenFromInbox,
    lastReadAt: patch.lastReadAt ?? access.lastReadAt,
    muted: patch.muted ?? access.muted,
    pinnedAt: patch.pinnedAt,
    role: "member",
  });
}

export async function memberAddresses(
  ctx: QueryCtx,
  conversation: Doc<"conversations">,
) {
  if (conversation.kind === "channel") {
    if (conversation.spaceId === undefined) return [];
    const spaceId = conversation.spaceId;
    const members = await ctx.db
      .query("spaceMembers")
      .withIndex("by_space_account", (index) => index.eq("spaceId", spaceId))
      .collect();
    return members.map((member) => member.accountId);
  }
  const members = await ctx.db
    .query("members")
    .withIndex("by_conversation_account", (index) =>
      index.eq("conversationId", conversation.conversationId),
    )
    .collect();
  return members.map((member) => member.accountId);
}

export function toMessage(message: Doc<"messages">): Message {
  return {
    attachments: message.attachments,
    authorId: message.authorId,
    authorName: message.authorName,
    body: message.body,
    conversationId: message.conversationId,
    linkPreview: message.linkPreview ?? null,
    messageId: message.messageId,
    sentAt: message.sentAt,
  };
}

export function latestMessage(ctx: QueryCtx, conversationId: string) {
  return ctx.db
    .query("messages")
    .withIndex("by_conversation_sent", (index) =>
      index.eq("conversationId", conversationId),
    )
    .order("desc")
    .first();
}

export async function unreadCount(
  ctx: QueryCtx,
  conversationId: string,
  accountId: string,
  lastReadAt: number,
) {
  const unread = await ctx.db
    .query("messages")
    .withIndex("by_conversation_sent", (index) =>
      index.eq("conversationId", conversationId).gt("sentAt", lastReadAt),
    )
    .take(MAX_UNREAD + 1);
  return unread.filter((message) => message.authorId !== accountId).length;
}

/**
 * Whether anyone else has written since `lastReadAt`. Cheaper than
 * `unreadCount` when only "any unread" matters, as for the app icon badge.
 */
export async function hasUnread(
  ctx: QueryCtx,
  conversationId: string,
  accountId: string,
  lastReadAt: number,
) {
  const newer = ctx.db
    .query("messages")
    .withIndex("by_conversation_sent", (index) =>
      index.eq("conversationId", conversationId).gt("sentAt", lastReadAt),
    );
  for await (const message of newer) {
    if (message.authorId !== accountId) return true;
  }
  return false;
}

export async function toConversation(
  ctx: QueryCtx,
  access: ConversationAccess,
  accountId: string,
): Promise<Conversation> {
  const { conversation, member } = access;
  const lastMessage = await latestMessage(ctx, conversation.conversationId);
  const space =
    conversation.spaceId === undefined
      ? null
      : await getSpace(ctx, conversation.spaceId);
  return {
    conversationId: conversation.conversationId,
    kind: conversation.kind,
    lastMessage: lastMessage === null ? null : toMessage(lastMessage),
    members: await memberAddresses(ctx, conversation),
    muted: access.muted,
    name: conversation.name ?? null,
    pinnedAt: member?.pinnedAt,
    showInInbox:
      conversation.kind === "channel"
        ? member?.hiddenFromInbox !== true
        : undefined,
    spaceId: conversation.spaceId ?? null,
    spaceName: space?.name,
    unreadCount: await unreadCount(
      ctx,
      conversation.conversationId,
      accountId,
      access.lastReadAt,
    ),
    updatedAt: conversation.updatedAt,
  };
}

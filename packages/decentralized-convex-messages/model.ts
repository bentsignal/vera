import { ConvexError } from "convex/values";

import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { Conversation, Message, Space } from "./protocol.ts";

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
  patch: Partial<Pick<Doc<"members">, "lastReadAt" | "muted">>,
) {
  if (access.member !== null) {
    await ctx.db.patch(access.member._id, patch);
    return;
  }
  await ctx.db.insert("members", {
    accountId,
    conversationId: access.conversation.conversationId,
    lastReadAt: patch.lastReadAt ?? access.lastReadAt,
    muted: patch.muted ?? access.muted,
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

export async function toConversation(
  ctx: QueryCtx,
  access: ConversationAccess,
  accountId: string,
): Promise<Conversation> {
  const { conversation } = access;
  const lastMessage = await latestMessage(ctx, conversation.conversationId);
  return {
    conversationId: conversation.conversationId,
    kind: conversation.kind,
    lastMessage: lastMessage === null ? null : toMessage(lastMessage),
    members: await memberAddresses(ctx, conversation),
    muted: access.muted,
    name: conversation.name ?? null,
    spaceId: conversation.spaceId ?? null,
    unreadCount: await unreadCount(
      ctx,
      conversation.conversationId,
      accountId,
      access.lastReadAt,
    ),
    updatedAt: conversation.updatedAt,
  };
}

export async function toSpace(
  ctx: QueryCtx,
  space: Doc<"spaces">,
  accountId: string,
): Promise<Space | null> {
  const self = await getSpaceMember(ctx, space.spaceId, accountId);
  if (self === null) return null;
  const members = await ctx.db
    .query("spaceMembers")
    .withIndex("by_space_account", (index) =>
      index.eq("spaceId", space.spaceId),
    )
    .collect();
  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_space", (index) => index.eq("spaceId", space.spaceId))
    .collect();
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

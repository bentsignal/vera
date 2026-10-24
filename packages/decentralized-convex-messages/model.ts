import { ConvexError } from "convex/values";

import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { CreatedKind } from "./naming.ts";
import type { AlertLevel, Conversation, Message } from "./protocol.ts";
import { chosenAlerts } from "./alertChoice.ts";
import { changedAtOf } from "./changes.ts";
import { latestMessage, unreadCount } from "./chatMessages.ts";
import { createdId, isCreatedId } from "./naming.ts";
import { readPosition } from "./readStates.ts";

const ADDRESS_PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const MAX_NAME_LENGTH = 80;

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

/**
 * The ID for a new group, space, or channel: the one the app proposed, or a
 * fresh one. A proposed ID must name the creator's home domain, like the
 * ones made here.
 */
export function newId(kind: CreatedKind, accountId: string, proposed?: string) {
  if (proposed === undefined) {
    return createdId(kind, accountId, crypto.randomUUID());
  }
  if (!isCreatedId(proposed, kind, accountId)) fail("INVALID_ID");
  return proposed;
}

/**
 * Whether a create with this ID already happened: true when it's the same
 * creator retrying (`isSame` checks it's the same kind of thing), so the
 * create returns what exists. Any other use of the ID fails.
 */
export function isRetriedCreate<Existing extends { createdBy: string }>(
  existing: Existing | null,
  self: string,
  isSame: (existing: Existing) => boolean,
) {
  if (existing === null) return false;
  if (existing.createdBy !== self || !isSame(existing)) fail("ID_TAKEN");
  return true;
}

/** Normalizes an optional name; blank means none. */
export function optionalName(value: string | undefined) {
  return value === undefined || value.trim().length === 0
    ? undefined
    : normalizeName(value);
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
  /** The caller's own choice of alerts for it, if they made one. */
  readonly alerts: AlertLevel | undefined;
  /** When alerts were last turned back on (0: never muted). */
  readonly alertsSince: number;
  readonly conversation: Doc<"conversations">;
  /**
   * How far the caller had read before `readStates`, which `readPosition`
   * falls back to. Not read there here, so most queries don't depend on
   * the caller's read state.
   */
  readonly readBefore: number;
  readonly member: Doc<"members"> | null;
  /** A channel's: the caller's choice for its whole space, if any. */
  readonly spaceAlerts: AlertLevel | undefined;
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
  const [conversation, member] = await Promise.all([
    getConversation(ctx, conversationId),
    getMember(ctx, conversationId, accountId),
  ]);
  if (conversation === null) return null;
  if (conversation.kind !== "channel") {
    return member === null
      ? null
      : {
          alerts: chosenAlerts(member),
          alertsSince: member.alertsSince ?? 0,
          conversation,
          member,
          readBefore: member.lastReadAt,
          spaceAlerts: undefined,
        };
  }
  return channelAccess(ctx, conversation, member, accountId);
}

/** A channel's access comes from membership of its space. */
async function channelAccess(
  ctx: QueryCtx,
  conversation: Doc<"conversations">,
  member: Doc<"members"> | null,
  accountId: string,
): Promise<ConversationAccess | null> {
  const spaceMember =
    conversation.spaceId === undefined
      ? null
      : await getSpaceMember(ctx, conversation.spaceId, accountId);
  if (spaceMember === null) return null;
  return {
    alerts: chosenAlerts(member),
    alertsSince: Math.max(
      member?.alertsSince ?? 0,
      spaceMember.alertsSince ?? 0,
    ),
    conversation,
    member,
    // Space members start with everything before they joined marked read.
    readBefore: member?.lastReadAt ?? spaceMember._creationTime,
    spaceAlerts: chosenAlerts(spaceMember),
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
      "alerts" | "alertsSince" | "hiddenFromInbox" | "muted" | "pinnedAt"
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
    alerts: "alerts" in patch ? patch.alerts : access.alerts,
    alertsSince: patch.alertsSince,
    conversationId: access.conversation.conversationId,
    hiddenFromInbox: patch.hiddenFromInbox,
    lastReadAt: access.readBefore,
    muted: patch.muted ?? access.alerts === "none",
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
    deletedAt: message.deletedAt,
    editedAt: message.editedAt,
    linkPreview: message.linkPreview ?? null,
    linkPreviews: message.linkPreviews,
    mentions: message.mentions,
    messageId: message.messageId,
    quote: message.quote,
    sentAt: message.sentAt,
    threadId: message.threadId,
    threadOnly: message.threadOnly,
  };
}

/**
 * `alerts` is what the conversation alerts the caller about (see
 * `alertsFor`), which the caller works out once for all they convert.
 */
export async function toConversation(
  ctx: QueryCtx,
  access: ConversationAccess,
  accountId: string,
  alerts: AlertLevel,
): Promise<Conversation> {
  const { conversation, member } = access;
  // Concurrent reads: an inbox converts every conversation it lists.
  const [latest, space, members, unread, changedAt] = await Promise.all([
    latestMessage(ctx, conversation.conversationId),
    conversation.spaceId === undefined
      ? null
      : getSpace(ctx, conversation.spaceId),
    memberAddresses(ctx, conversation),
    readPosition(ctx, access, accountId).then((readAt) =>
      unreadCount(ctx, conversation.conversationId, accountId, readAt),
    ),
    changedAtOf(ctx, conversation),
  ]);
  const lastMessage = latest.shown;
  return {
    alerts,
    changedAt,
    conversationId: conversation.conversationId,
    kind: conversation.kind,
    lastMessage: lastMessage === null ? null : toMessage(lastMessage),
    members,
    muted: alerts === "none",
    name: conversation.name ?? null,
    pinnedAt: member?.pinnedAt,
    showInInbox:
      conversation.kind === "channel"
        ? member?.hiddenFromInbox !== true
        : undefined,
    spaceId: conversation.spaceId ?? null,
    spaceName: space?.name,
    unreadCount: unread,
    // Sends don't write the conversation, so its newest message (even a
    // deleted one) is when it was last messaged.
    updatedAt: Math.max(conversation.updatedAt, latest.newestSentAt ?? 0),
  };
}

import type { OperationArgs } from "@decentralized-convex/plugin";

import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type {
  Contact,
  MessagePermission,
  MessagesFrom,
  PrivacySettings,
} from "./contactShapes.ts";
import type { messagesProtocol } from "./protocol.ts";
import { MAX_CONTACTS } from "./contactShapes.ts";
import {
  fail,
  getConversation,
  normalizeAddress,
  optionalName,
} from "./model.ts";
import { directConversationId } from "./naming.ts";
import { isHttpsUrl } from "./validation.ts";

// Contacts, and who can message an account (see `.plans/contacts.md`).

type Mutations = (typeof messagesProtocol)["mutations"];
type Args<Operation extends keyof Mutations> = OperationArgs<
  Mutations[Operation]
>;

export function contactRow(ctx: QueryCtx, owner: string, accountId: string) {
  return ctx.db
    .query("contacts")
    .withIndex("by_account_contact", (index) =>
      index.eq("accountId", owner).eq("contactId", accountId),
    )
    .unique();
}

function toContact(row: Doc<"contacts">): Contact {
  return {
    accountId: row.contactId,
    addedAt: row.addedAt,
    ...(row.avatarUrl === undefined ? {} : { avatarUrl: row.avatarUrl }),
    ...(row.name === undefined ? {} : { name: row.name }),
  };
}

/** An account's contacts, the most recently added first. */
export async function contacts(ctx: QueryCtx, self: string) {
  const rows = await ctx.db
    .query("contacts")
    .withIndex("by_account_added", (index) => index.eq("accountId", self))
    .order("desc")
    .take(MAX_CONTACTS);
  return rows.map(toContact);
}

/** A name or photo as stored: undefined clears it, null too. */
function detail<Value>(
  value: null | Value | undefined,
  normalize: (value: Value) => string | undefined,
) {
  return value === undefined
    ? {}
    : { value: value === null ? undefined : normalize(value) };
}

function contactPhoto(url: string) {
  if (!isHttpsUrl(url)) fail("INVALID_AVATAR_URL");
  return url;
}

export async function saveContact(
  ctx: MutationCtx,
  self: string,
  args: Args<"saveContact">,
) {
  const accountId = normalizeAddress(args.accountId);
  if (accountId === self) fail("INVALID_ADDRESS");
  const name = detail(args.name, optionalName);
  const avatarUrl = detail(args.avatarUrl, contactPhoto);
  const patch: Partial<Doc<"contacts">> = {
    ...("value" in name ? { name: name.value } : {}),
    ...("value" in avatarUrl ? { avatarUrl: avatarUrl.value } : {}),
  };
  const existing = await contactRow(ctx, self, accountId);
  if (existing !== null) {
    await ctx.db.patch(existing._id, patch);
    return null;
  }
  const count = (
    await ctx.db
      .query("contacts")
      .withIndex("by_account_added", (index) => index.eq("accountId", self))
      .take(MAX_CONTACTS)
  ).length;
  if (count >= MAX_CONTACTS) fail("TOO_MANY_CONTACTS");
  await ctx.db.insert("contacts", {
    accountId: self,
    addedAt: Date.now(),
    contactId: accountId,
    ...patch,
  });
  return null;
}

export async function removeContact(
  ctx: MutationCtx,
  self: string,
  args: Args<"removeContact">,
) {
  const row = await contactRow(ctx, self, normalizeAddress(args.accountId));
  if (row !== null) await ctx.db.delete(row._id);
  return null;
}

function privacyRow(ctx: QueryCtx, accountId: string) {
  return ctx.db
    .query("privacySettings")
    .withIndex("by_account", (index) => index.eq("accountId", accountId))
    .unique();
}

/** Who can message an account; everyone until it chooses. */
export async function privacySettings(
  ctx: QueryCtx,
  accountId: string,
): Promise<PrivacySettings> {
  const row = await privacyRow(ctx, accountId);
  return { messagesFrom: row?.messagesFrom ?? "everyone" };
}

export async function setPrivacySettings(
  ctx: MutationCtx,
  self: string,
  args: Args<"setPrivacySettings">,
) {
  const row = await privacyRow(ctx, self);
  if (row === null) {
    await ctx.db.insert("privacySettings", { accountId: self, ...args });
  } else {
    await ctx.db.patch(row._id, args);
  }
  return null;
}

async function allows(
  ctx: QueryCtx,
  messagesFrom: MessagesFrom,
  to: string,
  from: string,
) {
  if (messagesFrom === "everyone") return true;
  if ((await contactRow(ctx, to, from)) === null) return false;
  return (
    messagesFrom === "contacts" || (await contactRow(ctx, from, to)) !== null
  );
}

/**
 * Whether `from` can start a direct conversation with `to` or add them to
 * a group, by `to`'s choice of who can message them. An account this PDS
 * doesn't keep has no choice here, so it allows everyone.
 */
export async function acceptsMessagesFrom(
  ctx: QueryCtx,
  to: string,
  from: string,
) {
  if (to === from) return true;
  const { messagesFrom } = await privacySettings(ctx, to);
  return allows(ctx, messagesFrom, to, from);
}

/** Fails with `NOT_ACCEPTING_MESSAGES` unless `to` accepts `from`. */
export async function requireAcceptsMessages(
  ctx: QueryCtx,
  to: string,
  from: string,
) {
  if (!(await acceptsMessagesFrom(ctx, to, from))) {
    fail("NOT_ACCEPTING_MESSAGES");
  }
}

/**
 * Whether the caller can message someone: a direct conversation that
 * exists stays open whatever they choose.
 */
export async function messagePermission(
  ctx: QueryCtx,
  self: string,
  accountId: string,
): Promise<MessagePermission> {
  const other = accountId.trim().toLowerCase();
  const groups = await acceptsMessagesFrom(ctx, other, self);
  const direct =
    groups ||
    (await getConversation(ctx, directConversationId(self, other))) !== null;
  return { direct, groups };
}

/**
 * How `owner` shows some people, for their pushes: the name and photo they
 * gave the ones in their contacts.
 */
export async function shownTo(
  ctx: QueryCtx,
  owner: string,
  accountIds: readonly string[],
) {
  const shown: Record<string, { avatarUrl?: string; name?: string }> = {};
  for (const accountId of new Set(accountIds)) {
    const row = await contactRow(ctx, owner, accountId);
    if (row === null) continue;
    if (row.name === undefined && row.avatarUrl === undefined) continue;
    shown[accountId] = {
      ...(row.avatarUrl === undefined ? {} : { avatarUrl: row.avatarUrl }),
      ...(row.name === undefined ? {} : { name: row.name }),
    };
  }
  return shown;
}

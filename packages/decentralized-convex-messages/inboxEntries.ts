import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { latestMessage } from "./chatMessages.ts";

// Each account's inbox in order of latest activity (`inboxEntries`), so
// it's read a page at a time rather than all at once (inboxPages.ts). See
// .plans/inbox-paging.md. A message moves its conversation up a moment
// later (inboxOrder.ts); who has rows changes with who's in what
// (inboxMembers.ts); rows for what came before are filled in once
// (inboxFill.ts).

export type Section = Doc<"inboxEntries">["section"];

/** The rows an inbox lists with or without channels. */
export function shownSections(channels: boolean): readonly Section[] {
  return channels ? ["chats", "channels"] : ["chats"];
}

/**
 * A conversation's latest activity, as its `updatedAt` has it: when it
 * was created, or its newest message (a deleted one too).
 */
export async function conversationActivity(
  ctx: QueryCtx,
  conversation: Doc<"conversations">,
) {
  const latest = await latestMessage(ctx, conversation.conversationId);
  return Math.max(conversation.updatedAt, latest.newestSentAt ?? 0);
}

export function entryOf(
  ctx: QueryCtx,
  accountId: string,
  conversationId: string,
) {
  return ctx.db
    .query("inboxEntries")
    .withIndex("by_account_conversation", (index) =>
      index.eq("accountId", accountId).eq("conversationId", conversationId),
    )
    .unique();
}

/** Where a conversation goes in an inbox, before the person's choices. */
export function sectionOf(
  conversation: Doc<"conversations">,
  member: Pick<Doc<"members">, "hiddenFromInbox"> | null,
): Section {
  if (conversation.kind !== "channel") return "chats";
  return member?.hiddenFromInbox === true ? "hidden" : "channels";
}

/**
 * Lists a conversation in an account's inbox, or updates its row: its
 * activity only ever rises, and `section` and `pinnedAt` change only
 * when given. One row per account and conversation, so a job and a live
 * change making the same row end with one.
 */
export async function upsertEntry(
  ctx: MutationCtx,
  accountId: string,
  conversation: Doc<"conversations">,
  fields: {
    readonly activityAt: number;
    readonly pinnedAt?: number | null;
    readonly section?: Section;
  },
) {
  const existing = await entryOf(ctx, accountId, conversation.conversationId);
  const pinnedAt =
    fields.pinnedAt === undefined
      ? {}
      : { pinnedAt: fields.pinnedAt ?? undefined };
  if (existing === null) {
    await ctx.db.insert("inboxEntries", {
      accountId,
      activityAt: fields.activityAt,
      conversationId: conversation.conversationId,
      section: fields.section ?? sectionOf(conversation, null),
      spaceId: conversation.spaceId,
      ...pinnedAt,
    });
    return;
  }
  const patch = changesTo(existing, fields);
  if (Object.keys(patch).length > 0) await ctx.db.patch(existing._id, patch);
}

/** What `upsertEntry` changes on an existing row. */
function changesTo(
  existing: Doc<"inboxEntries">,
  fields: {
    readonly activityAt: number;
    readonly pinnedAt?: number | null;
    readonly section?: Section;
  },
) {
  const patch: Partial<Doc<"inboxEntries">> = {};
  if (fields.activityAt > existing.activityAt) {
    patch.activityAt = fields.activityAt;
  }
  if (fields.section !== undefined && fields.section !== existing.section) {
    patch.section = fields.section;
  }
  const pinnedAt = fields.pinnedAt ?? undefined;
  if (fields.pinnedAt !== undefined && pinnedAt !== existing.pinnedAt) {
    // Undefined removes the field: unpinned.
    patch.pinnedAt = pinnedAt;
  }
  return patch;
}

/** Lists a new direct message or group in its members' inboxes. */
export async function addEntries(
  ctx: MutationCtx,
  conversation: Doc<"conversations">,
  accountIds: readonly string[],
) {
  const activityAt = await conversationActivity(ctx, conversation);
  for (const accountId of accountIds) {
    await upsertEntry(ctx, accountId, conversation, { activityAt });
  }
}

/** Takes a conversation out of one account's inbox. */
export async function removeEntry(
  ctx: MutationCtx,
  accountId: string,
  conversationId: string,
) {
  const existing = await entryOf(ctx, accountId, conversationId);
  if (existing !== null) await ctx.db.delete(existing._id);
}

/** The caller's pin or section changed (see `setPinned`, `setShowInInbox`). */
export async function updateOwnEntry(
  ctx: MutationCtx,
  accountId: string,
  conversation: Doc<"conversations">,
  change: { readonly pinnedAt?: number | null; readonly section?: Section },
) {
  await upsertEntry(ctx, accountId, conversation, {
    activityAt: await conversationActivity(ctx, conversation),
    ...change,
  });
}

export function getConversationRow(ctx: QueryCtx, conversationId: string) {
  return ctx.db
    .query("conversations")
    .withIndex("by_conversation", (index) =>
      index.eq("conversationId", conversationId),
    )
    .unique();
}

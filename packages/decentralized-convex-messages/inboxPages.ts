import type { OperationArgs } from "@decentralized-convex/plugin";

import type { QueryCtx } from "./_generated/server.js";
import type { Section } from "./inboxEntries.ts";
import type { ConversationAccess } from "./model.ts";
import type { messagesProtocol } from "./protocol.ts";
import type { SpaceReads } from "./spaceReads.ts";
import { conversationActivity, shownSections } from "./inboxEntries.ts";
import { isFilled } from "./inboxFill.ts";
import { findAccess } from "./model.ts";
import { INBOX_PAGE_SIZE, MAX_PINNED } from "./protocol.ts";
import { spaceReads } from "./spaceReads.ts";

// Reading an inbox a page at a time, newest first, from its rows
// (`inboxEntries`). See .plans/inbox-paging.md.

type Queries = (typeof messagesProtocol)["queries"];

/**
 * Every direct message and group, plus (with `channels`) the channels of
 * the caller's spaces that they haven't left out of the inbox. Channels
 * have member rows only once read, so they come from space membership
 * instead. Unbounded: only until the inbox's rows are filled in
 * (`isFilled`), after which it reads them a page at a time.
 */
async function everyAccess(
  ctx: QueryCtx,
  self: string,
  channels: boolean,
  spaces: SpaceReads,
) {
  // Every conversation is read concurrently; reading them one at a time made
  // a large inbox take a second, and every write to it waits for that.
  const memberships = await ctx.db
    .query("members")
    .withIndex("by_account", (index) => index.eq("accountId", self))
    .collect();
  const direct = await Promise.all(
    memberships.map((membership) =>
      findAccess(ctx, membership.conversationId, self),
    ),
  );
  const found = direct.filter(
    (access): access is ConversationAccess =>
      access !== null && access.conversation.kind !== "channel",
  );
  if (!channels) return found;
  const memberOf = await ctx.db
    .query("spaceMembers")
    .withIndex("by_account", (index) => index.eq("accountId", self))
    .collect();
  const spaceChannels = await Promise.all(
    memberOf.map(async ({ spaceId }) => {
      const conversations = await ctx.db
        .query("conversations")
        .withIndex("by_space", (index) => index.eq("spaceId", spaceId))
        .collect();
      return Promise.all(
        conversations.map((channel) =>
          findAccess(ctx, channel.conversationId, self, spaces),
        ),
      );
    }),
  );
  for (const access of spaceChannels.flat()) {
    if (access === null || access.member?.hiddenFromInbox === true) continue;
    found.push(access);
  }
  return found;
}

/** An inbox row's place: pinned, or by activity (see `inboxPage`). */
interface Listed {
  readonly activityAt: number;
  readonly conversationId: string;
  readonly pinnedAt?: number;
}

/** Rows tied with a page's last at the same time that come along with it. */
const MAX_TIES = 50;

/**
 * The newest `limit` unpinned rows in `sections` with activity before
 * `before`, plus any tied with the last, and whether there are more.
 */
async function newestRows(
  ctx: QueryCtx,
  self: string,
  sections: readonly Section[],
  before: number | undefined,
  limit: number,
) {
  // Pinned rows are skipped, so each section reads past at most those.
  const most = limit + MAX_PINNED + MAX_TIES + 1;
  const bySection = await Promise.all(
    sections.map(async (section) => {
      const rows = await ctx.db
        .query("inboxEntries")
        .withIndex("by_account_section_activity", (index) => {
          const scoped = index.eq("accountId", self).eq("section", section);
          return before === undefined
            ? scoped
            : scoped.lt("activityAt", before);
        })
        .order("desc")
        .take(most);
      return {
        exhausted: rows.length < most,
        rows: rows.filter((row) => row.pinnedAt === undefined),
      };
    }),
  );
  const merged = bySection
    .flatMap(({ rows }) => rows)
    .sort((left, right) => right.activityAt - left.activityAt);
  const page = merged.slice(0, limit);
  const last = page.at(-1);
  if (last === undefined) return { page, next: null };
  let end = page.length;
  while (end < merged.length && merged[end]?.activityAt === last.activityAt) {
    end += 1;
  }
  const rows = merged.slice(0, Math.min(end, limit + MAX_TIES));
  const more =
    rows.length < merged.length ||
    bySection.some(({ exhausted }) => !exhausted);
  return { page: rows, next: more ? (rows.at(-1)?.activityAt ?? null) : null };
}

/** The caller's pinned rows in `sections`, in the order pinned. */
async function pinnedRows(
  ctx: QueryCtx,
  self: string,
  sections: readonly Section[],
) {
  const rows = await ctx.db
    .query("inboxEntries")
    .withIndex("by_account_pinned", (index) =>
      index.eq("accountId", self).gt("pinnedAt", 0),
    )
    .take(MAX_PINNED);
  return rows.filter((row) => sections.includes(row.section));
}

/**
 * One page of the caller's inbox, from its rows (see `inboxPage` in the
 * protocol), or before they're filled in, from every conversation.
 */
async function pageOfRows(
  ctx: QueryCtx,
  self: string,
  {
    before,
    channels,
    limit,
  }: { before?: number; channels: boolean; limit: number },
  spaces: SpaceReads,
): Promise<{ next: number | null; pinned: Listed[]; rows: Listed[] }> {
  if (!(await isFilled(ctx))) {
    return pageOfEvery(ctx, self, { before, channels, limit }, spaces);
  }
  const sections = shownSections(channels);
  const [newest, pinned] = await Promise.all([
    newestRows(ctx, self, sections, before, limit),
    before === undefined ? pinnedRows(ctx, self, sections) : [],
  ]);
  return { next: newest.next, pinned, rows: newest.page };
}

/** `pageOfRows` before the rows are filled in: every conversation, sorted. */
async function pageOfEvery(
  ctx: QueryCtx,
  self: string,
  {
    before,
    channels,
    limit,
  }: { before?: number; channels: boolean; limit: number },
  spaces: SpaceReads,
) {
  const accesses = await everyAccess(ctx, self, channels, spaces);
  const listed = await Promise.all(
    accesses.map(
      async ({ conversation, member }): Promise<Listed> => ({
        activityAt: await conversationActivity(ctx, conversation),
        conversationId: conversation.conversationId,
        pinnedAt: member?.pinnedAt,
      }),
    ),
  );
  const unpinned = listed
    .filter(
      (row) =>
        row.pinnedAt === undefined &&
        (before === undefined || row.activityAt < before),
    )
    .sort((left, right) => right.activityAt - left.activityAt);
  const rows = unpinned.slice(0, limit);
  return {
    next: unpinned.length > limit ? (rows.at(-1)?.activityAt ?? null) : null,
    pinned:
      before === undefined
        ? listed
            .filter((row) => row.pinnedAt !== undefined)
            .sort((left, right) => (left.pinnedAt ?? 0) - (right.pinnedAt ?? 0))
        : [],
    rows,
  };
}

/** A page's size: `limit` if given, within 1 and `INBOX_PAGE_SIZE`. */
function pageSize(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit)) return INBOX_PAGE_SIZE;
  return Math.min(INBOX_PAGE_SIZE, Math.max(1, Math.floor(limit)));
}

/** One page of the caller's inbox (see `inboxPage` in the protocol). */
export async function inboxPage(
  ctx: QueryCtx,
  self: string,
  args: OperationArgs<Queries["inboxPage"]>,
  spaces: SpaceReads = spaceReads(ctx),
) {
  const { next, pinned, rows } = await pageOfRows(
    ctx,
    self,
    {
      before: args.before,
      channels: args.channels === true,
      limit: pageSize(args.limit),
    },
    spaces,
  );
  return {
    conversationIds: rows.map(({ conversationId }) => conversationId),
    next,
    pinned: pinned.map(({ conversationId }) => conversationId),
  };
}

/**
 * The caller's access to the conversations of their inbox's first `limit`
 * rows and its pins: what `inbox` and `inboxConversations` (from before
 * pages) list, and what the badge counts. Rows for conversations they've
 * left since are skipped.
 */
export async function listedAccess(
  ctx: QueryCtx,
  self: string,
  { channels, limit }: { channels: boolean; limit: number },
  spaces: SpaceReads = spaceReads(ctx),
) {
  const { pinned, rows } = await pageOfRows(
    ctx,
    self,
    { channels, limit },
    spaces,
  );
  const ids = [
    ...new Set([...pinned, ...rows].map((row) => row.conversationId)),
  ];
  const found = await Promise.all(
    ids.map((conversationId) => findAccess(ctx, conversationId, self, spaces)),
  );
  return found.filter(
    (access): access is ConversationAccess =>
      access !== null &&
      (channels || access.conversation.kind !== "channel") &&
      access.member?.hiddenFromInbox !== true,
  );
}

/**
 * The caller's access to the conversations active since `since`, newest
 * first, at most `limit`: what activity looks at for new messages.
 */
export async function recentAccess(
  ctx: QueryCtx,
  self: string,
  { limit, since }: { limit: number; since: number },
  spaces: SpaceReads,
) {
  if (!(await isFilled(ctx))) {
    return everyAccess(ctx, self, true, spaces);
  }
  const bySection = await Promise.all(
    shownSections(true).map((section) =>
      ctx.db
        .query("inboxEntries")
        .withIndex("by_account_section_activity", (index) =>
          index
            .eq("accountId", self)
            .eq("section", section)
            .gt("activityAt", since),
        )
        .order("desc")
        .take(limit),
    ),
  );
  const rows = bySection
    .flat()
    .sort((left, right) => right.activityAt - left.activityAt)
    .slice(0, limit);
  const found = await Promise.all(
    rows.map(({ conversationId }) =>
      findAccess(ctx, conversationId, self, spaces),
    ),
  );
  return found.filter(
    (access): access is ConversationAccess =>
      access !== null && access.member?.hiddenFromInbox !== true,
  );
}

import type { Conversation } from "@decentralized-convex/messages";
import type { PdsOptimisticLocalStore } from "@decentralized-convex/tanstack-query";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { useState } from "react";
import {
  keepPreviousData,
  partialMatchKey,
  useQueries,
  useQueryClient,
} from "@tanstack/react-query";
import {
  pdsQuery,
  pdsSessionQueryKey,
} from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { fieldOf } from "~/features/saved/fields";
import { liveSelected } from "~/features/saved/saved-cache";
import { cachedSelect } from "./cached";
import { pdsResultOr } from "./results";

// An account's Inbox as two kinds of query: its pages (which
// conversations, `inboxPage`), which change only when the conversations on
// them do, and a row for each (its `conversation` query), which changes
// with its messages. A message updates one row rather than resending the
// whole Inbox. A page's first answer brings its rows with it, so it still
// opens in one round trip (see .plans/data-pass.md, B).
//
// Pages are read newest first, and each one after the first starts where
// the one before it ends (its `next`) as that is now, so a conversation
// that moves up never leaves a gap between pages
// (.plans/inbox-paging.md).

/** One page of an account's Inbox: its conversations' IDs, pinned first. */
export interface InboxPage {
  readonly ids: readonly string[];
  /** Where the next page starts, or null at the end. */
  readonly next: number | null;
}

/** A page of an account's Inbox: the first, or the one before `before`. */
export function inboxPageQuery(session: string, before?: number) {
  return pdsQuery({
    args:
      before === undefined ? { channels: true } : { before, channels: true },
    options: {
      // A PDS that couldn't answer has no list to show.
      select: (result): InboxPage | null => {
        // One home PDS answers.
        const page = pdsResultOr(result, null)?.[0];
        return page == null
          ? null
          : { ids: [...page.pinned, ...page.conversationIds], next: page.next };
      },
      // A page whose start moved keeps showing until its new answer comes.
      placeholderData: keepPreviousData,
    },
    query: pds.messages.inboxPage,
    session,
  });
}

/** An account's Inbox's first page, with its pins. */
export function inboxListQuery(session: string) {
  return inboxPageQuery(session);
}

/** One Inbox row: its conversation, as the conversation's screen has it. */
export function inboxRowQuery(session: string, conversationId: string) {
  return pdsQuery({
    args: { conversationId },
    // A row its PDS failed to answer is left out rather than waited for:
    // the Inbox's list waits only for its first load, but its badge waits
    // for every row (see `InboxSnapshot.complete`).
    options: {
      select: (result) => {
        const found = pdsResultOr(result, null);
        return found === null ? null : found?.[0];
      },
    },
    query: pds.messages.conversation,
    session,
  });
}

/** An Inbox, as its pages and rows have loaded. */
export interface InboxSnapshot {
  /**
   * Its conversations once the first page has loaded (those whose rows
   * have), null if its PDS couldn't answer, undefined while it loads.
   */
  readonly data: Conversation[] | null | undefined;
  /** When any of it last changed. */
  readonly dataUpdatedAt: number;
  /** Every row the pages name has loaded. */
  readonly complete: boolean;
  /** The first page's conversations: what Home's badge counts. */
  readonly first: readonly string[];
  /** Whether there's a page after the last one loaded. */
  readonly more: boolean;
}

/**
 * The page queries of an account's first `count` pages: each after the
 * first starts where the one before it ends now (its cached `next`), so
 * the chain follows the pages as they change. While a page's new answer
 * loads, the one after it keeps its last start (`known`), so its rows
 * stay up rather than blinking out.
 */
function pageChain(
  queryClient: QueryClient,
  session: string,
  count: number,
  known: readonly number[],
) {
  const chain = [inboxPageQuery(session)];
  const starts = new Array<number>();
  for (let index = 1; index < count; index += 1) {
    const before = chain[index - 1];
    const cached =
      before === undefined ? undefined : cachedSelect(queryClient, before);
    const next = cached === undefined ? known[index - 1] : cached?.next;
    if (next == null) break;
    starts.push(next);
    chain.push(inboxPageQuery(session, next));
  }
  return { chain, starts };
}

/**
 * Each account's Inbox (see `InboxSnapshot`), in the order given, with as
 * many pages as `pages` says for it (one by default).
 */
export function useInboxes(
  accounts: readonly string[],
  pages: Readonly<Record<string, number>> = {},
) {
  const queryClient = useQueryClient();
  // Where each account's pages after the first last started.
  const [known, setKnown] = useState<Readonly<Record<string, number[]>>>({});
  const built = accounts.map((session) =>
    pageChain(queryClient, session, pages[session] ?? 1, known[session] ?? []),
  );
  const changed = accounts.filter(
    (session, index) =>
      built[index]?.starts.join() !== (known[session] ?? []).join(),
  );
  if (changed.length > 0) {
    setKnown({
      ...known,
      ...Object.fromEntries(
        changed.map((session) => [
          session,
          built[accounts.indexOf(session)]?.starts ?? [],
        ]),
      ),
    });
  }
  const chains = built.map(({ chain }) => chain);
  const results = useQueries({ queries: chains.flat() });
  // Each account's page results, from where its chain starts.
  const starts = chains.map((_, index) =>
    chains.slice(0, index).reduce((sum, chain) => sum + chain.length, 0),
  );
  const lists = chains.map((chain, index) =>
    results.slice(starts[index], (starts[index] ?? 0) + chain.length),
  );
  const wanted = accounts.flatMap((session, index) =>
    [
      ...new Set(
        (lists[index] ?? []).flatMap((result) => result.data?.ids ?? []),
      ),
    ].map((conversationId) => ({ conversationId, session })),
  );
  const rows = useQueries({
    queries: wanted.map(({ conversationId, session }) =>
      inboxRowQuery(session, conversationId),
    ),
  });
  return accounts.map((session, index): InboxSnapshot => {
    const own = lists[index] ?? [];
    const head = own[0];
    if (head?.data == null) {
      return {
        complete: head?.data === null,
        data: head?.data,
        dataUpdatedAt: head?.dataUpdatedAt ?? 0,
        first: [],
        more: false,
      };
    }
    const mine = rows.filter((_, row) => wanted[row]?.session === session);
    return {
      complete: mine.every((row) => row.data !== undefined),
      data: mine.flatMap((row) => (row.data == null ? [] : [row.data])),
      dataUpdatedAt: Math.max(
        ...own.map((page) => page.dataUpdatedAt),
        ...mine.map((row) => row.dataUpdatedAt),
      ),
      first: head.data.ids,
      more: own.at(-1)?.data?.next != null,
    };
  });
}

/**
 * An account's Inbox from the cache, as its PDS last sent it (not what's
 * saved on the device): undefined unless the list and every row are live.
 */
export function liveInbox(queryClient: QueryClient, session: string) {
  const ids = liveSelected(queryClient, inboxListQuery(session))?.ids;
  if (ids == null) return undefined;
  const rows = ids.map((conversationId) =>
    liveSelected(queryClient, inboxRowQuery(session, conversationId)),
  );
  if (rows.some((row) => row === undefined)) return undefined;
  return rows.filter((row): row is Conversation => row != null);
}

/** Whether a query is part of the account's Inbox: its list or a row. */
export function isInboxQuery(
  query: { readonly queryKey: QueryKey },
  session: string,
) {
  const request = query.queryKey[5];
  const type = fieldOf(fieldOf(request, "operation"), "type");
  return (
    (type === "inboxPage" || type === "conversation") &&
    partialMatchKey(query.queryKey, pdsSessionQueryKey(session))
  );
}

type Store = PdsOptimisticLocalStore;

/** Lists a new conversation at the top of every loaded first Inbox page. */
export function addToInboxLists(
  store: Store,
  { conversationId }: Pick<Conversation, "conversationId" | "kind">,
) {
  for (const { args, request, value } of store.getAllQueries(
    pds.messages.inboxPage,
  )) {
    if (value === undefined || args.before !== undefined) continue;
    if (
      value.conversationIds.includes(conversationId) ||
      value.pinned.includes(conversationId)
    ) {
      continue;
    }
    store.setQuery(request, {
      ...value,
      conversationIds: [conversationId, ...value.conversationIds],
    });
  }
}

/** Takes the conversations `gone` says out of every loaded Inbox page. */
export function removeFromInboxLists(
  store: Store,
  gone: (conversationId: string) => boolean,
) {
  for (const { request, value } of store.getAllQueries(
    pds.messages.inboxPage,
  )) {
    if (value === undefined) continue;
    if (!value.conversationIds.some(gone) && !value.pinned.some(gone)) {
      continue;
    }
    store.setQuery(request, {
      ...value,
      conversationIds: value.conversationIds.filter((id) => !gone(id)),
      pinned: value.pinned.filter((id) => !gone(id)),
    });
  }
}

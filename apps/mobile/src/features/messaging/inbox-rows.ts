import type { Conversation } from "@decentralized-convex/messages";
import type { PdsOptimisticLocalStore } from "@decentralized-convex/tanstack-query";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { partialMatchKey, useQueries } from "@tanstack/react-query";
import {
  pdsQuery,
  pdsSessionQueryKey,
} from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { fieldOf } from "~/features/saved/fields";
import { liveSelected } from "~/features/saved/saved-cache";
import { pdsResult, pdsResultOr } from "./results";

// An account's Inbox as two kinds of query: its list (which conversations,
// `inboxConversations`), which changes only when the list does, and a row
// for each (its `conversation` query), which changes with its messages. A
// message updates one row rather than resending the whole Inbox. The
// list's first answer brings every row with it, so it still opens in one
// round trip (see .plans/data-pass.md, B).

/** An account's Inbox list: the IDs of its conversations. */
export function inboxListQuery(session: string) {
  return pdsQuery({
    args: { channels: true },
    // A PDS that couldn't answer has no list to show.
    options: { select: (result) => pdsResultOr(result, null) },
    query: pds.messages.inboxConversations,
    session,
  });
}

/** One Inbox row: its conversation, as the conversation's screen has it. */
export function inboxRowQuery(session: string, conversationId: string) {
  return pdsQuery({
    args: { conversationId },
    options: { select: (result) => pdsResult(result)?.[0] },
    query: pds.messages.conversation,
    session,
  });
}

/** An Inbox, as its list and rows have loaded. */
export interface InboxSnapshot {
  /**
   * Its conversations once the list has loaded (those whose rows have),
   * null if its PDS couldn't answer, undefined while the list loads.
   */
  readonly data: Conversation[] | null | undefined;
  /** When any of it last changed. */
  readonly dataUpdatedAt: number;
  /** Every row the list names has loaded. */
  readonly complete: boolean;
}

/** Each account's Inbox (see `InboxSnapshot`), in the order given. */
export function useInboxes(accounts: readonly string[]) {
  const lists = useQueries({ queries: accounts.map(inboxListQuery) });
  const wanted = accounts.flatMap((session, index) =>
    (lists[index]?.data ?? []).map((conversationId) => ({
      conversationId,
      session,
    })),
  );
  const rows = useQueries({
    queries: wanted.map(({ conversationId, session }) =>
      inboxRowQuery(session, conversationId),
    ),
  });
  return accounts.map((session, index): InboxSnapshot => {
    const list = lists[index];
    if (list?.data == null) {
      return {
        complete: list?.data === null,
        data: list?.data,
        dataUpdatedAt: list?.dataUpdatedAt ?? 0,
      };
    }
    const own = rows.filter((_, row) => wanted[row]?.session === session);
    return {
      complete: own.every((row) => row.data !== undefined),
      data: own.flatMap((row) => (row.data == null ? [] : [row.data])),
      dataUpdatedAt: Math.max(
        list.dataUpdatedAt,
        ...own.map((row) => row.dataUpdatedAt),
      ),
    };
  });
}

/**
 * An account's Inbox from the cache, as its PDS last sent it (not what's
 * saved on the device): undefined unless the list and every row are live.
 */
export function liveInbox(queryClient: QueryClient, session: string) {
  const ids = liveSelected(queryClient, inboxListQuery(session));
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
    (type === "inboxConversations" || type === "conversation") &&
    partialMatchKey(query.queryKey, pdsSessionQueryKey(session))
  );
}

type Store = PdsOptimisticLocalStore;

/** Lists a new conversation in every loaded Inbox list showing its kind. */
export function addToInboxLists(
  store: Store,
  { conversationId, kind }: Pick<Conversation, "conversationId" | "kind">,
) {
  for (const { args, request, value } of store.getAllQueries(
    pds.messages.inboxConversations,
  )) {
    if (value === undefined || (kind === "channel" && args.channels !== true)) {
      continue;
    }
    if (value.includes(conversationId)) continue;
    store.setQuery(request, [conversationId, ...value]);
  }
}

/** Takes the conversations `gone` says out of every loaded Inbox list. */
export function removeFromInboxLists(
  store: Store,
  gone: (conversationId: string) => boolean,
) {
  for (const { request, value } of store.getAllQueries(
    pds.messages.inboxConversations,
  )) {
    if (value?.some(gone) !== true) continue;
    store.setQuery(
      request,
      value.filter((conversationId) => !gone(conversationId)),
    );
  }
}

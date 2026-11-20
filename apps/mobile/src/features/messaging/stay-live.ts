import type { Query, QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  partialMatchKey,
  QueryObserver,
  useQueryClient,
} from "@tanstack/react-query";
import { pdsSessionQueryKey } from "@decentralized-convex/tanstack-query";

import { fieldOf } from "~/features/saved/fields";
import { useAccount } from "./account";

/** How long a conversation stays live after its screen closes. */
const STAY_LIVE_MS = 3 * 60 * 1000;
/** How many closed conversations stay live at once; the oldest go first. */
const STAY_LIVE_MAX = 5;

/**
 * The closed conversations staying live, oldest first, each with what
 * lets it go.
 */
const staying = new Map<string, () => void>();

/** Whether a query is one of the session's about the conversation. */
function isAbout(query: Query, session: string, conversationId: string) {
  const request = query.queryKey[5];
  const args = fieldOf(fieldOf(request, "operation"), "args");
  return (
    partialMatchKey(query.queryKey, pdsSessionQueryKey(session)) &&
    fieldOf(args, "conversationId") === conversationId
  );
}

/**
 * Whether anything about the conversation is live: its screen is open, or
 * it's staying live after closing.
 */
export function isLive(
  queryClient: QueryClient,
  session: string,
  conversationId: string,
) {
  return queryClient
    .getQueryCache()
    .findAll({ predicate: (query) => query.isActive() })
    .some((query) => isAbout(query, session, conversationId));
}

/**
 * Whether a query is worth keeping live after its screen closes: not
 * who's typing, which changes every few seconds while someone types and
 * is asked for again when the screen opens (typists shown from before
 * run out on their own).
 */
function keepsLive(query: Query) {
  const request = query.queryKey[5];
  return fieldOf(fieldOf(request, "operation"), "type") !== "typing";
}

/**
 * Keeps `queries` live for `STAY_LIVE_MS`, as if their screen were still
 * open: the PDS keeps sending what changes, so it's there when the
 * conversation opens again.
 */
function stayLive(
  queryClient: QueryClient,
  key: string,
  queries: readonly Query[],
) {
  staying.get(key)?.();
  const stops = queries.filter(keepsLive).map((query) =>
    new QueryObserver(queryClient, {
      ...query.options,
      queryKey: query.queryKey,
    }).subscribe(() => undefined),
  );
  function letGo() {
    clearTimeout(timer);
    for (const stop of stops) stop();
    staying.delete(key);
  }
  const timer = setTimeout(letGo, STAY_LIVE_MS);
  staying.set(key, letGo);
  if (staying.size > STAY_LIVE_MAX) staying.values().next().value?.();
}

/**
 * Keeps what a conversation's screen showed live for a few minutes after
 * it closes (new messages, reactions), so opening it again
 * shows them at once instead of catching up as it fades in. Opening it
 * again lets go of the earlier ones, which its own screen takes over. With
 * `threadId`, the same for a thread in it.
 */
export function useStayLive(conversationId: string, threadId?: string) {
  const queryClient = useQueryClient();
  const { address } = useAccount();
  // eslint-disable-next-line no-restricted-syntax -- What a screen showed is only known by watching the cache while it's open, and it stays live only once the screen closes.
  useEffect(() => {
    const key = [address, conversationId, threadId ?? ""].join(" ");
    const cache = queryClient.getQueryCache();
    const shown = new Set(
      cache
        .findAll({ predicate: (query) => query.isActive() })
        .filter((query) => isAbout(query, address, conversationId))
        .map(({ queryHash }) => queryHash),
    );
    const unsubscribe = cache.subscribe((event) => {
      if (event.type !== "observerAdded") return;
      const query = cache.get(event.query.queryHash);
      if (query !== undefined && isAbout(query, address, conversationId)) {
        shown.add(query.queryHash);
      }
    });
    // Once this screen's own queries are watched, after this commit.
    const takeOver = setTimeout(() => staying.get(key)?.(), 0);
    return () => {
      unsubscribe();
      clearTimeout(takeOver);
      stayLive(
        queryClient,
        key,
        [...shown].flatMap((hash) => cache.get(hash) ?? []),
      );
    };
  }, [queryClient, address, conversationId, threadId]);
}

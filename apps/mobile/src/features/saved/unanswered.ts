import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { partialMatchKey } from "@tanstack/react-query";
import { pdsSessionQueryKey } from "@decentralized-convex/tanstack-query";

import { fieldOf } from "./fields";

/**
 * The accounts whose PDS a screen gave up waiting for, until it answers
 * again. Once one screen has waited out the deadline, the next would too,
 * so their screens show what's saved as soon as they open.
 */
const unanswered = new Set<string>();

/**
 * How long an account's PDS goes unanswered before screens say it can't
 * connect. Screens show what's saved as soon as it stops answering (see
 * `useSavedFallback`), but a slow answer is common, so they wait this
 * much longer to say so: about 6 seconds after a screen opens.
 */
const OFFLINE_AFTER_MS = 4000;
/**
 * How long screens say an account can't connect once they start to, even
 * if its PDS answers sooner, so it never flickers in and straight back out.
 */
const OFFLINE_MIN_MS = 1000;

/** When screens started saying each account can't connect. */
const shownSince = new Map<string, number>();
/** Waiting out `OFFLINE_AFTER_MS` for each account, before saying so. */
const waiting = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Whether screens should say any of these accounts can't connect: from
 * `OFFLINE_AFTER_MS` after its PDS stops answering until it answers, and
 * at least `OFFLINE_MIN_MS`.
 */
export function useShowsOffline(addresses: readonly string[]) {
  return useSyncExternalStore(subscribe, () =>
    addresses.some((address) => shownSince.has(address)),
  );
}

export function isUnanswered(address: string) {
  return unanswered.has(address);
}

/** Whether screens say any account can't connect (`useShowsOffline`). */
export function anyShownOffline() {
  return shownSince.size > 0;
}

export function markUnanswered(address: string) {
  unanswered.add(address);
  if (shownSince.has(address) || waiting.has(address)) return;
  waiting.set(
    address,
    setTimeout(() => {
      waiting.delete(address);
      if (!unanswered.has(address)) return;
      shownSince.set(address, Date.now());
      notify();
    }, OFFLINE_AFTER_MS),
  );
}

function markAnswered(address: string) {
  unanswered.delete(address);
  clearTimeout(waiting.get(address));
  waiting.delete(address);
  const since = shownSince.get(address);
  if (since === undefined) return;
  setTimeout(
    () => {
      if (unanswered.has(address)) return;
      shownSince.delete(address);
      notify();
    },
    Math.max(0, since + OFFLINE_MIN_MS - Date.now()),
  );
}

/**
 * Counts the account's PDS as answering again once one of its queries has
 * a result from a server. Saved results name no servers.
 */
function noteAnswer(
  address: string,
  query: { readonly queryKey: QueryKey; readonly state: { data: unknown } },
) {
  if (!partialMatchKey(query.queryKey, pdsSessionQueryKey(address))) return;
  const { data } = query.state;
  const status = fieldOf(data, "status");
  const sources = fieldOf(fieldOf(data, "federation"), "sources");
  if (
    (status === "success" || status === "partial") &&
    Array.isArray(sources) &&
    sources.length > 0
  ) {
    markAnswered(address);
  }
}

/**
 * Watches an account's queries for an answer from its PDS while it's
 * counted as not answering. Returns a function that stops.
 */
export function watchAnswers(queryClient: QueryClient, address: string) {
  const cache = queryClient.getQueryCache();
  return cache.subscribe((event) => {
    if (
      !unanswered.has(address) ||
      event.type !== "updated" ||
      event.action.type !== "success"
    ) {
      return;
    }
    const query = cache.get(event.query.queryHash);
    if (query !== undefined) noteAnswer(address, query);
  });
}

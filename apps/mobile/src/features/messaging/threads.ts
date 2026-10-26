import type {
  ThreadState,
  ThreadSummary,
} from "@decentralized-convex/messages";
import type { PdsOptimisticLocalStore } from "@decentralized-convex/tanstack-query";
import type { QueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
// eslint-disable-next-line no-restricted-imports -- Expo Router has no route loaders to preload suspense queries.
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { pdsMutation, pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import type { ThreadInfo } from "~/features/conversation/types";
import { selectionTick } from "~/lib/native-extras";
import { useAccount } from "./account";
import { chunks } from "./reactions";
import { useMarkUpTo } from "./read-marks";
import { cachedSelected, pdsResult, pdsResultOr } from "./results";
import { showThreadFollowed, showThreadRead } from "./thread-lists";

/**
 * Each thread's replies across every PDS that stores some: their counts
 * added up, and the people who wrote the newest ones first. A PDS can
 * answer more than once (as home and as a member's), so a summary seen
 * twice counts once.
 */
function combine(summaries: readonly ThreadSummary[]) {
  const byThread = new Map<string, ThreadSummary[]>();
  const seen = new Set<string>();
  for (const summary of summaries) {
    const key = `${summary.threadId} ${summary.lastReplyAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    byThread.set(summary.threadId, [
      ...(byThread.get(summary.threadId) ?? []),
      summary,
    ]);
  }
  return new Map(
    [...byThread].map(([threadId, found]): [string, ThreadInfo] => {
      const newestFirst = [...found].sort(
        (left, right) => right.lastReplyAt - left.lastReplyAt,
      );
      return [
        threadId,
        {
          repliers: [
            ...new Set(newestFirst.flatMap(({ repliers }) => repliers)),
          ],
          replyCount: found.reduce(
            (total, { replyCount }) => total + replyCount,
            0,
          ),
        },
      ];
    }),
  );
}

/** The summaries of one batch of a page's threads. */
export function summariesQuery(
  session: string,
  conversationId: string,
  messageIds: readonly string[],
) {
  return pdsQuery({
    args: { conversationId, messageIds: [...messageIds] },
    options: {
      enabled: messageIds.length > 0,
      // A PDS that can't answer (an older one) has no threads.
      select: (result) => pdsResultOr(result, [])?.flat(),
    },
    query: pds.messages.threadSummaries,
    session,
  });
}

/** Every thread replied to after `since`: the newest messages' (see `windowParts`). */
export function summariesSinceQuery(
  session: string,
  conversationId: string,
  since: number,
) {
  return pdsQuery({
    args: { conversationId, since },
    options: { select: (result) => pdsResultOr(result, [])?.flat() },
    query: pds.messages.threadSummaries,
    session,
  });
}

/** Whether the queries `sources` asks for have answers in the cache. */
export function summariesCached(
  queryClient: QueryClient,
  session: string,
  conversationId: string,
  { threadIds, since }: Pick<ThreadSources, "since" | "threadIds">,
) {
  const queries = [
    ...threadIds
      .flatMap(chunks)
      .map((ids) => summariesQuery(session, conversationId, ids)),
    ...(since === undefined
      ? []
      : [summariesSinceQuery(session, conversationId, since)]),
  ];
  return queries.every(
    (query) => cachedSelected(queryClient, query) !== undefined,
  );
}

/** Where a window's thread summaries come from (see `windowParts`). */
export interface ThreadSources {
  /** Batches of threads, each a fixed set, by page. */
  readonly threadIds: readonly (readonly string[])[];
  /** Every thread replied to after this, when set. */
  readonly since: number | undefined;
  /** The loaded messages' threads `since` covers. */
  readonly liveThreadIds: readonly string[];
}

/**
 * How many replies the loaded messages' threads have, asked for like
 * reactions (see `useReactions`). `threadOf` is undefined for a message
 * without replies, and `isLoaded` says whether that's known yet.
 */
export function useThreadSummaries(
  session: string,
  conversationId: string,
  { liveThreadIds, since, threadIds }: ThreadSources,
  /** The window opening instead, if any (see `useReactions`). */
  ahead?: Pick<ThreadSources, "since" | "threadIds">,
) {
  const batches = threadIds.flatMap(chunks);
  function queriesFor(ids: readonly (readonly string[])[], after?: number) {
    return [
      ...ids.map((batch) => summariesQuery(session, conversationId, batch)),
      ...(after === undefined
        ? []
        : [summariesSinceQuery(session, conversationId, after)]),
    ];
  }
  const { loaded, threads } = useQueries({
    queries: [
      ...queriesFor(batches, since),
      ...queriesFor(ahead?.threadIds.flatMap(chunks) ?? [], ahead?.since),
    ],
    combine: (results) => {
      const sinceAnswer =
        since === undefined ? undefined : results[batches.length]?.data;
      return {
        loaded: [
          ...batches.flatMap((ids, index) =>
            results[index]?.data === undefined ? [] : ids,
          ),
          ...(sinceAnswer === undefined ? [] : liveThreadIds),
        ],
        threads: combine(results.flatMap((result) => result.data ?? [])),
      };
    },
  });
  const loadedIds = new Set(loaded);
  return {
    isLoaded: (threadId: string) => loadedIds.has(threadId),
    threadOf: (threadId: string) => threads.get(threadId),
  };
}

/** Shows a thread's bell as turned on or off, here and in thread lists. */
function showFollowed(
  store: PdsOptimisticLocalStore,
  args: { conversationId: string; followed: boolean; threadId: string },
) {
  showThreadFollowed(store, args);
  const request = pds.messages.threadState({
    conversationId: args.conversationId,
    threadId: args.threadId,
  });
  const state = store.getQuery(request);
  store.setQuery(request, {
    lastReadAt: state?.lastReadAt ?? null,
    following: args.followed,
  } satisfies ThreadState);
}

/**
 * Your place in a thread (whether its bell is on) and a toggle that shows
 * right away.
 */
export function useThreadState(conversationId: string, threadId: string) {
  const { address } = useAccount();
  const { data } = useQuery(
    pdsQuery({
      args: { conversationId, threadId },
      options: { select: (result) => pdsResult(result)?.[0] },
      query: pds.messages.threadState,
      session: address,
    }),
  );
  const { mutate } = useMutation(
    pdsMutation({
      mutation: pds.messages.setThreadFollowed,
      optimisticUpdate: showFollowed,
      session: address,
    }),
  );
  const following = data?.following;
  return {
    /** Undefined until it has loaded. */
    following,
    /** Turns the bell off or back on, showing it right away. */
    toggle: () => {
      if (following === undefined) return;
      selectionTick();
      mutate(
        { conversationId, followed: !following, threadId },
        {
          onError: () =>
            Alert.alert(
              "Couldn't Change Notifications",
              "Try again in a moment.",
            ),
        },
      );
    },
  };
}

/** Marks the thread read up to its newest reply while it is open. */
export function useMarkThreadRead(
  conversationId: string,
  threadId: string,
  newestSentAt?: number,
) {
  const { address } = useAccount();
  const { mutate } = useMutation({
    ...pdsMutation({
      mutation: pds.messages.markThreadRead,
      optimisticUpdate: showThreadRead,
      session: address,
    }),
    // Not something you did (see `useMarkRead`).
    meta: { background: true },
  });
  useMarkUpTo(newestSentAt, (readAt) =>
    mutate({ conversationId, readAt, threadId }),
  );
}

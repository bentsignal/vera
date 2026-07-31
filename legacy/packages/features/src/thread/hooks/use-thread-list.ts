import type { PaginationStatus } from "convex/react";
import { useEffect, useRef, useState } from "react";
// eslint-disable-next-line no-restricted-imports -- useQuery reads the SSR-prefetched first page so the sidebar renders real threads on first paint instead of the skeleton
import { useQuery } from "@tanstack/react-query";
import { usePaginatedQuery } from "convex/react";

import { api } from "@acme/db/api";

import { useDebouncedInput } from "../../hooks/use-debounced-input";
import { INITIAL_PAGE_SIZE, PAGE_SIZE } from "../config/thread-config";
import { threadQueries } from "../lib/queries";

export function useThreadList() {
  const { setValue: setSearch, debouncedValue: debouncedSearch } =
    useDebouncedInput();

  const firstPageQuery = useQuery({
    ...threadQueries.listFirstPage(debouncedSearch),
    select: (data) => ({ page: data.page, isDone: data.isDone }),
  });

  const liveQuery = usePaginatedQuery(
    api.ai.thread.list.get,
    { search: debouncedSearch },
    {
      initialNumItems: INITIAL_PAGE_SIZE,
    },
  );

  const shouldUseLiveResults = liveQuery.status !== "LoadingFirstPage";
  const liveThreads = shouldUseLiveResults
    ? liveQuery.results
    : (firstPageQuery.data?.page ?? []);
  const liveStatus = deriveLiveStatus(
    shouldUseLiveResults,
    liveQuery.status,
    firstPageQuery,
  );

  // Keep the previous results on screen while a new search is loading so the
  // list doesn't flash empty between the debounce firing and the new query
  // resolving.
  const { threads, status } = usePreviousResultsWhileLoading(
    liveThreads,
    liveStatus,
  );

  // The sidebar list's scroll-based loader can fire during hydration — before
  // the live Convex query has exited `LoadingFirstPage` — whenever the
  // prefetched first page already sits within the loader threshold (e.g. it
  // fits on screen). Dropping that request would wedge infinite scroll; stash
  // it and flush once the live query is ready.
  const pendingLoadMore = useRef(false);
  function loadMoreThreads() {
    if (shouldUseLiveResults) {
      liveQuery.loadMore(PAGE_SIZE);
    } else {
      pendingLoadMore.current = true;
    }
  }
  // eslint-disable-next-line no-restricted-syntax -- Syncs the deferred pagination request above with Convex's live query once it exits LoadingFirstPage; there is no render-time signal for that external transition.
  useEffect(() => {
    if (shouldUseLiveResults && pendingLoadMore.current) {
      pendingLoadMore.current = false;
      liveQuery.loadMore(PAGE_SIZE);
    }
  }, [shouldUseLiveResults, liveQuery]);

  return {
    status,
    loadMoreThreads,
    threads,
    setSearch,
  };
}

function deriveLiveStatus(
  shouldUseLiveResults: boolean,
  liveQueryStatus: PaginationStatus,
  firstPageQuery: {
    data: { isDone: boolean } | undefined;
    isLoading: boolean;
  },
) {
  if (shouldUseLiveResults) return liveQueryStatus;
  if (firstPageQuery.data?.isDone)
    return "Exhausted" as const satisfies PaginationStatus;
  if (firstPageQuery.isLoading)
    return "LoadingFirstPage" as const satisfies PaginationStatus;
  return "CanLoadMore" as const satisfies PaginationStatus;
}

function usePreviousResultsWhileLoading<T>(
  liveThreads: T[],
  liveStatus: PaginationStatus,
) {
  const [cachedThreads, setCachedThreads] = useState(liveThreads);
  const [cachedStatus, setCachedStatus] = useState(liveStatus);
  if (
    liveStatus !== "LoadingFirstPage" &&
    (liveThreads !== cachedThreads || liveStatus !== cachedStatus)
  ) {
    setCachedThreads(liveThreads);
    setCachedStatus(liveStatus);
  }
  const isRefetching =
    liveStatus === "LoadingFirstPage" && cachedThreads.length > 0;
  return {
    threads: isRefetching ? cachedThreads : liveThreads,
    status: isRefetching ? cachedStatus : liveStatus,
  };
}

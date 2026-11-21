import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * A query's cached data as its `select` reads it, or undefined before it
 * has any: for a page whose cursor is where the page before it ends.
 */
export function cachedSelect<Data, Selected>(
  queryClient: QueryClient,
  query: { queryKey: QueryKey; select?: (data: Data) => Selected },
) {
  const data = queryClient.getQueryData<Data>(query.queryKey);
  return data === undefined ? undefined : query.select?.(data);
}

/**
 * The queries of `count` pages after `start`, each starting where the one
 * before it ends (its cached `next`), as far as they've loaded.
 */
export function chainAfter<Cursor, Query extends { queryKey: QueryKey }>({
  count,
  nextOf,
  queryFor,
  start,
}: {
  count: number;
  nextOf: (query: Query) => Cursor | null | undefined;
  queryFor: (after: Cursor) => Query;
  start: Cursor | undefined;
}) {
  const chain = new Array<Query>();
  let after = start;
  while (after !== undefined && chain.length < count) {
    const query = queryFor(after);
    chain.push(query);
    after = nextOf(query) ?? undefined;
  }
  return chain;
}

/**
 * Whether there's a page after the ones loaded: the first page said so
 * (`start`) and the last loaded one has a `next`.
 */
export function morePages(
  start: unknown,
  last: { data?: { next: unknown } | null } | undefined,
) {
  if (start === undefined) return false;
  return last === undefined || (last.data?.next ?? null) !== null;
}

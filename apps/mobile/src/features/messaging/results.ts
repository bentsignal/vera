import type { PdsQueryData } from "@decentralized-convex/tanstack-query";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { PdsInitialResponseTimeoutError } from "@decentralized-convex/client";

/** The merged result once any PDS has answered, otherwise undefined. */
export function pdsResult<Result, Source>(
  data: PdsQueryData<Result, Source> | undefined,
) {
  if (data === undefined) return undefined;
  return data.status === "partial" || data.status === "success"
    ? data.result
    : undefined;
}

/**
 * Whether a query failed only because its PDSs haven't answered yet. They
 * may still: it isn't an answer that there's nothing.
 */
function unanswered<Result, Source>(
  data: Extract<PdsQueryData<Result, Source>, { status: "error" }>,
) {
  if (data.error instanceof PdsInitialResponseTimeoutError) return true;
  const { sources } = data.federation;
  return (
    sources.length > 0 &&
    sources.every(
      (source) =>
        source.status === "error" &&
        source.error instanceof PdsInitialResponseTimeoutError,
    )
  );
}

/**
 * Like `pdsResult`, but `fallback` once the PDS has failed, for optional
 * extras (such as from a PDS that predates them) that shouldn't hold up a
 * screen. A PDS that hasn't answered hasn't failed: still undefined, so an
 * unreachable server doesn't look empty.
 */
export function pdsResultOr<Result, Source, Fallback>(
  data: PdsQueryData<Result, Source> | undefined,
  fallback: Fallback,
) {
  return data?.status === "error" && !unanswered(data)
    ? fallback
    : pdsResult(data);
}

/** What's cached of a query, as its screen reads it (its `select`). */
export function cachedSelected<Data, Selected>(
  queryClient: QueryClient,
  options: { queryKey: QueryKey; select?: (data: Data) => Selected },
) {
  const data = queryClient
    .getQueryCache()
    .find<Data>({ exact: true, queryKey: options.queryKey })?.state.data;
  return data === undefined ? undefined : options.select?.(data);
}

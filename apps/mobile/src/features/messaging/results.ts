import type { PdsQueryData } from "@decentralized-convex/tanstack-query";

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
 * Like `pdsResult`, but `fallback` once the PDS has failed, for optional
 * extras (such as from a PDS that predates them) that shouldn't hold up a
 * screen.
 */
export function pdsResultOr<Result, Source, Fallback>(
  data: PdsQueryData<Result, Source> | undefined,
  fallback: Fallback,
) {
  return data?.status === "error" ? fallback : pdsResult(data);
}

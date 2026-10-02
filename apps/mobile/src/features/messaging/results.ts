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

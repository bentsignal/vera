import type {
  DefaultCombinedResult,
  FederatedQueryOptions,
  FederationQueryReference,
} from "@decentralized-convex/client";
import type { QueryKey } from "@tanstack/react-query";
import type { FunctionReturnType } from "convex/server";

export interface FederatedTanStackQueryOptions<
  Query extends FederationQueryReference,
  Combined = DefaultCombinedResult<FunctionReturnType<Query>>,
> extends FederatedQueryOptions<Query, Combined> {
  enabled?: boolean;
  queryKey: QueryKey;
}

export function federatedQueryOptions<
  Query extends FederationQueryReference,
  Combined = DefaultCombinedResult<FunctionReturnType<Query>>,
>(
  options: FederatedTanStackQueryOptions<Query, Combined>,
): FederatedTanStackQueryOptions<Query, Combined> {
  return options;
}

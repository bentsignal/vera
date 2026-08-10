import type {
  AnyPdsQueryRequest,
  DefaultCombinedPdsResult,
  DefaultCombinedResult,
  FederatedPdsQueryOptions,
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

export interface FederatedPdsTanStackQueryOptions<
  Request extends AnyPdsQueryRequest,
  Combined = DefaultCombinedPdsResult<Request>,
> extends FederatedPdsQueryOptions<Request, Combined> {
  enabled?: boolean;
  queryKey: QueryKey;
}

export function federatedPdsQueryOptions<
  Request extends AnyPdsQueryRequest,
  Combined = DefaultCombinedPdsResult<Request>,
>(
  options: FederatedPdsTanStackQueryOptions<Request, Combined>,
): FederatedPdsTanStackQueryOptions<Request, Combined> {
  return options;
}

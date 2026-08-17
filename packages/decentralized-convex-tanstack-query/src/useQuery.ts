import type {
  AnyPdsQueryRequest,
  DefaultCombinedPdsResult,
  FederatedQueryStatus,
  FederationSourceSnapshot,
  PdsQueryData,
  PdsRequestResult,
} from "@decentralized-convex/client";
import type {
  DefaultError,
  DefinedUseQueryResult,
  QueryClient,
  UseQueryOptions,
} from "@tanstack/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";

import type { PdsQueryKey, PdsQueryOptions } from "./pds.ts";
import { usePdsQueryState } from "./pds.ts";

type QueryData<Request extends AnyPdsQueryRequest> = PdsQueryData<
  DefaultCombinedPdsResult<Request>
>;

export type PdsUseQueryOptions<
  Request extends AnyPdsQueryRequest,
  Data = QueryData<Request>,
> = Omit<
  UseQueryOptions<QueryData<Request>, DefaultError, Data, PdsQueryKey<Request>>,
  "initialData" | "meta" | "queryFn" | "queryKey"
> & {
  readonly query: PdsQueryOptions<Request>;
};

export type PdsUseQueryResult<
  Request extends AnyPdsQueryRequest,
  Data = QueryData<Request>,
> = DefinedUseQueryResult<Data, DefaultError> & {
  readonly federation: {
    readonly sources: readonly FederationSourceSnapshot<
      PdsRequestResult<Request>
    >[];
    readonly status: FederatedQueryStatus;
  };
};

/**
 * Extends the application's TanStack useQuery with one nested PDS query and
 * federation diagnostics in the result.
 */
export function useQuery<
  Request extends AnyPdsQueryRequest,
  Data = QueryData<Request>,
>(
  { query, ...options }: PdsUseQueryOptions<Request, Data>,
  queryClient?: QueryClient,
): PdsUseQueryResult<Request, Data> {
  const result = useTanStackQuery<
    QueryData<Request>,
    DefaultError,
    Data,
    PdsQueryKey<Request>
  >({ ...query, ...options }, queryClient);
  const snapshot = usePdsQueryState(query, queryClient);

  return {
    ...result,
    federation: {
      sources: snapshot.sources,
      status: snapshot.status,
    },
  };
}

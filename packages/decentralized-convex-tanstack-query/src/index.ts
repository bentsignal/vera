export { decentralizedConvexPackage } from "../metadata.ts";
export { mapPdsQueryData } from "@decentralized-convex/client";
export type {
  SuccessfulPdsQueryData,
  PdsOptimisticLocalStore,
  PdsOptimisticQuery,
  PdsQueryData,
  PdsQueryFederation,
} from "@decentralized-convex/client";
export { federatedQueryOptions } from "./options.ts";
export type { FederatedTanStackQueryOptions } from "./options.ts";
export { IncompletePdsQueryError, PdsQueryClient } from "./pds-query-client.ts";
export type { PdsQueryClientOptions } from "./pds-query-client.ts";
export { pdsMutation, pdsQuery, pdsSessionQueryKey } from "./pds.ts";
export type {
  CompletePdsQueryBuilderOptions,
  CompletePdsQueryConfig,
  CompletePdsQueryOptions,
  PdsMutationConfig,
  PdsQueryBuilderOptions,
  PdsQueryConfig,
  PdsQueryKey,
  PdsQueryOptions,
} from "./pds.ts";
export { useFederatedQuery } from "./useFederatedQuery.ts";
export type { FederatedTanStackQueryResult } from "./useFederatedQuery.ts";

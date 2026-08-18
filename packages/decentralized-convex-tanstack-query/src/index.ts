export { decentralizedConvexPackage } from "../metadata.ts";
export { mapPdsQueryData } from "@decentralized-convex/client";
export type {
  PdsQueryData,
  PdsQueryFederation,
} from "@decentralized-convex/client";
export { federatedQueryOptions } from "./options.ts";
export type { FederatedTanStackQueryOptions } from "./options.ts";
export { pdsMutation, pdsQuery, PdsQueryClient } from "./pds.ts";
export type {
  PdsMutationConfig,
  PdsQueryBuilderOptions,
  PdsQueryConfig,
  PdsQueryKey,
  PdsQueryOptions,
} from "./pds.ts";
export { useFederatedQuery } from "./useFederatedQuery.ts";
export type { FederatedTanStackQueryResult } from "./useFederatedQuery.ts";

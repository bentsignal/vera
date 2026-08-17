export { decentralizedConvexPackage } from "../metadata.ts";
export { mapPdsQueryData } from "@decentralized-convex/client";
export type { PdsQueryData } from "@decentralized-convex/client";
export { federatedQueryOptions } from "./options.ts";
export type { FederatedTanStackQueryOptions } from "./options.ts";
export {
  pdsMutation,
  pdsQuery,
  PdsQueryClient,
  usePdsQueryState,
} from "./pds.ts";
export type { PdsQueryKey, PdsQueryOptions } from "./pds.ts";
export { useQuery } from "./useQuery.ts";
export type { PdsUseQueryOptions, PdsUseQueryResult } from "./useQuery.ts";
export { useFederatedQuery } from "./useFederatedQuery.ts";
export type { FederatedTanStackQueryResult } from "./useFederatedQuery.ts";

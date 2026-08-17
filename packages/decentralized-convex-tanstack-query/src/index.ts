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
export type { PdsQueryKey } from "./pds.ts";
export { useFederatedQuery } from "./useFederatedQuery.ts";
export type { FederatedTanStackQueryResult } from "./useFederatedQuery.ts";

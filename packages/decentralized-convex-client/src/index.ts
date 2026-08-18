export { decentralizedConvexPackage } from "../metadata.ts";
export { DecentralizedConvexClient } from "./client.ts";
export { PdsInitialResponseTimeoutError } from "./errors.ts";
export {
  DEFAULT_INITIAL_RESPONSE_TIMEOUT,
  DEFAULT_REVEAL_PARTIAL_RESULTS_AFTER,
} from "./query-execution.ts";
export type { PdsQueryExecutionOptions } from "./query-execution.ts";
export {
  assertPdsCompatibility,
  assertPdsRequestCompatibility,
  IncompatiblePdsError,
} from "./compatibility.ts";
export {
  accountDomain,
  decodeDnsTxtData,
  discoverPds,
  parsePdsTxtRecord,
  PDS_DISCOVERY_RECORD_FORMAT,
  PDS_DNS_LABEL,
} from "@decentralized-convex/address";
export type {
  DiscoverPdsOptions,
  DiscoveredPds,
  PdsManifest,
} from "@decentralized-convex/address";
export { createConvexPdsConnection } from "./connection.ts";
export {
  definePdsApi,
  pdsApiRequirements,
  pdsFunctions,
  PdsClient,
} from "./pds.ts";
export { FederatedQueryObserver } from "./observer.ts";
export { FederatedPdsQueryObserver } from "./pds-observer.ts";
export { mapPdsQueryData, pdsQueryDataFromSnapshot } from "./query-data.ts";
export type {
  PdsQueryData,
  PdsQueryFederation,
  SuccessfulPdsQueryData,
} from "./query-data.ts";
export { defaultCombine } from "./snapshot.ts";
export { groupFederationTargets, normalizeFederationUrl } from "./targets.ts";
export type {
  DefaultCombinedResult,
  FederatedQueryArgs,
  FederatedQueryOptions,
  FederatedQuerySnapshot,
  FederatedQueryStatus,
  FederationAuthRequest,
  FederationAuthTokenFetcher,
  FederationClientOptions,
  FederationConnection,
  FederationConnectionFactory,
  FederationMutationReference,
  FederationQueryReference,
  FederationSourceSnapshot,
  FederationSourceStatus,
  FederationTarget,
  FederationTargetGroup,
  SuccessfulFederationSource,
} from "./types.ts";
export type {
  AnyPdsMutationRequest,
  AnyPdsQueryRequest,
  BoundPdsApi,
  DefaultCombinedPdsResult,
  FederatedPdsQueryOptions,
  PdsApi,
  PdsConnection,
  PdsPluginApi,
  PdsQueryResult,
  PdsRequest,
  PdsRequestResult,
} from "./pds.ts";

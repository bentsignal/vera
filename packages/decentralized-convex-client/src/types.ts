import type { DiscoveredPds } from "@decentralized-convex/address";
import type {
  DefaultFunctionArgs,
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";

import type { SerializedPdsRequest } from "./api.ts";
import type { PdsConnectionMutationOptions } from "./optimistic.ts";

export type FederationQueryReference = FunctionReference<
  "query",
  "public",
  DefaultFunctionArgs,
  unknown
>;

export type FederationMutationReference = FunctionReference<
  "mutation",
  "public",
  DefaultFunctionArgs,
  unknown
>;

export interface FederationTarget {
  /**
   * The domain whose discovery led to this PDS. The PDS is believed only
   * about that domain's accounts (see `Operation.trust`), and is asked
   * apart from any other domain that names the same deployment.
   */
  domain?: string;
  id: string;
  url: string;
}

export interface FederationTargetGroup {
  /** As on `FederationTarget`. */
  domain?: string;
  ids: readonly string[];
  url: string;
}

export type FederationSourceStatus = "pending" | "live" | "stale" | "error";
export type FederatedQueryStatus = "pending" | "success" | "partial" | "error";

export type FederationSourceSnapshot<Result> =
  | {
      data: Result;
      status: "live";
      target: FederationTargetGroup;
    }
  | {
      data: Result;
      error: Error;
      status: "stale";
      target: FederationTargetGroup;
    }
  | {
      error: Error;
      status: "error";
      target: FederationTargetGroup;
    }
  | {
      status: "pending";
      target: FederationTargetGroup;
    };

export interface FederatedQuerySnapshot<Combined, Result> {
  data: Combined;
  /**
   * Other queries' results that came with this one from the home PDS,
   * complete there, for the client to cache (see `include` on the PDS).
   */
  included?: readonly IncludedPdsQuery[];
  sources: readonly FederationSourceSnapshot<Result>[];
  status: FederatedQueryStatus;
}

/** Another query's complete result, answered along with the one asked. */
export interface IncludedPdsQuery {
  readonly request: SerializedPdsRequest;
  readonly snapshot: FederatedQuerySnapshot<unknown, unknown>;
}

export interface SuccessfulFederationSource<Result> {
  data: Result;
  target: FederationTargetGroup;
}

export type DefaultCombinedResult<Result> =
  Result extends readonly (infer Item)[] ? Item[] : Result[];

export type FederatedQueryArgs<Query extends FederationQueryReference> =
  | FunctionArgs<Query>
  | ((target: FederationTargetGroup) => FunctionArgs<Query>);

export interface FederatedQueryOptions<
  Query extends FederationQueryReference,
  Combined = DefaultCombinedResult<FunctionReturnType<Query>>,
> {
  args: FederatedQueryArgs<Query>;
  combine?: (
    sources: readonly SuccessfulFederationSource<FunctionReturnType<Query>>[],
  ) => Combined;
  query: Query;
  targets: readonly FederationTarget[];
}

export interface FederationAuthRequest {
  forceRefreshToken: boolean;
  pds?: DiscoveredPds;
  url: string;
}

export type FederationAuthTokenFetcher = (
  request: FederationAuthRequest,
) => Promise<null | string | undefined>;

export interface FederationConnection {
  close: () => Promise<void>;
  /**
   * Signs in again with the token the fetcher has now (asked for without
   * `forceRefreshToken`), as when the app wakes with a fresh one ready, so
   * the connection doesn't present an expired one first and wait for the
   * PDS to refuse it.
   */
  reauthenticate?: () => void;
  mutation: <Mutation extends FederationMutationReference>(
    mutation: Mutation,
    args: FunctionArgs<Mutation>,
    options?: PdsConnectionMutationOptions,
  ) => Promise<FunctionReturnType<Mutation>>;
  query: <Query extends FederationQueryReference>(
    query: Query,
    args: FunctionArgs<Query>,
  ) => Promise<FunctionReturnType<Query>>;
  subscribe: <Query extends FederationQueryReference>(
    query: Query,
    args: FunctionArgs<Query>,
    onResult: (result: FunctionReturnType<Query>) => void,
    onError: (error: Error) => void,
  ) => () => void;
}

export type FederationConnectionFactory = (
  url: string,
  getAuthToken?: FederationAuthTokenFetcher,
) => FederationConnection;

export interface FederationClientOptions {
  connectionFactory?: FederationConnectionFactory;
  getAuthToken?: FederationAuthTokenFetcher;
  pds?: {
    discover?: (addressOrDomain: string) => Promise<DiscoveredPds>;
    home: DiscoveredPds;
  };
}

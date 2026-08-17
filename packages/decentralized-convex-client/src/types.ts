import type { DiscoveredPds } from "@decentralized-convex/address";
import type {
  DefaultFunctionArgs,
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";

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
  id: string;
  url: string;
}

export interface FederationTargetGroup {
  ids: readonly string[];
  url: string;
}

export type FederationSourceStatus = "pending" | "live" | "error";
export type FederatedQueryStatus = "pending" | "success" | "partial" | "error";

export type FederationSourceSnapshot<Result> =
  | {
      data: Result;
      status: "live";
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
  sources: readonly FederationSourceSnapshot<Result>[];
  status: FederatedQueryStatus;
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
  mutation: <Mutation extends FederationMutationReference>(
    mutation: Mutation,
    args: FunctionArgs<Mutation>,
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

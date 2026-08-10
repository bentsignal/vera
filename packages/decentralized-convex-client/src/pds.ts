import type {
  AnyPluginProtocol,
  OperationArgs,
  OperationMap,
  OperationResult,
} from "@decentralized-convex/plugin";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { makeFunctionReference } from "convex/server";

import type {
  FederationTarget,
  FederationTargetGroup,
  SuccessfulFederationSource,
} from "./types.ts";

declare const PdsResultType: unique symbol;

interface SerializedPdsRequest {
  readonly [key: string]: unknown;
  readonly operation: {
    readonly args: Record<string, unknown>;
    readonly type: string;
  };
  readonly plugin: string;
  readonly version: string;
}

export interface PdsRequest<
  Result,
  Kind extends "mutation" | "query",
> extends SerializedPdsRequest {
  readonly [PdsResultType]?: {
    readonly kind: Kind;
    readonly result: Result;
  };
}

export type AnyPdsQueryRequest = PdsRequest<unknown, "query">;
export type AnyPdsMutationRequest = PdsRequest<unknown, "mutation">;

export type PdsRequestResult<Request> =
  Request extends PdsRequest<infer Result, "mutation" | "query">
    ? Result
    : never;

export type DefaultCombinedPdsResult<Request extends AnyPdsQueryRequest> =
  PdsRequestResult<Request> extends readonly (infer Item)[]
    ? Item[]
    : PdsRequestResult<Request>[];

export interface FederatedPdsQueryOptions<
  Request extends AnyPdsQueryRequest,
  Combined = DefaultCombinedPdsResult<Request>,
> {
  combine?: (
    sources: readonly SuccessfulFederationSource<PdsRequestResult<Request>>[],
  ) => Combined;
  request: Request | ((target: FederationTargetGroup) => Request);
  targets: readonly FederationTarget[];
}

type OperationRequestBuilders<
  PluginName extends string,
  PluginVersion extends string,
  Operations extends OperationMap,
  Kind extends "mutation" | "query",
> = {
  readonly [Name in keyof Operations]: (
    args: OperationArgs<Operations[Name]>,
  ) => PdsRequest<OperationResult<Operations[Name]>, Kind> & {
    readonly operation: {
      readonly args: OperationArgs<Operations[Name]>;
      readonly type: Name;
    };
    readonly plugin: PluginName;
    readonly version: PluginVersion;
  };
};

export interface PdsPluginApi<Protocol extends AnyPluginProtocol> {
  readonly mutations: OperationRequestBuilders<
    Protocol["name"],
    Protocol["version"],
    Protocol["mutations"],
    "mutation"
  >;
  readonly queries: OperationRequestBuilders<
    Protocol["name"],
    Protocol["version"],
    Protocol["queries"],
    "query"
  >;
}

export type PdsApi<
  Protocols extends Readonly<Record<string, AnyPluginProtocol>>,
> = {
  readonly [Name in keyof Protocols]: PdsPluginApi<Protocols[Name]>;
};

export function definePdsApi<
  const Protocols extends Readonly<Record<string, AnyPluginProtocol>>,
>(protocols: Protocols): PdsApi<Protocols> {
  const api = Object.fromEntries(
    Object.entries(protocols).map(([name, protocol]) => [
      name,
      {
        mutations: defineRequestBuilders(
          protocol.name,
          protocol.version,
          protocol.mutations,
        ),
        queries: defineRequestBuilders(
          protocol.name,
          protocol.version,
          protocol.queries,
        ),
      },
    ]),
  );

  // The runtime object is constructed from the exact protocol map supplied by the caller.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return api as PdsApi<Protocols>;
}

type RootQuery = FunctionReference<
  "query",
  "public",
  SerializedPdsRequest,
  unknown
>;

type RootMutation = FunctionReference<
  "mutation",
  "public",
  SerializedPdsRequest,
  unknown
>;

export const pdsFunctions = Object.freeze({
  mutation: makeFunctionReference<"mutation", SerializedPdsRequest, unknown>(
    "pds:dispatchMutation",
  ),
  query: makeFunctionReference<"query", SerializedPdsRequest, unknown>(
    "pds:dispatchQuery",
  ),
});

export interface PdsConnection {
  close(): Promise<void>;
  mutation<Mutation extends RootMutation>(
    mutation: Mutation,
    args: SerializedPdsRequest,
  ): Promise<FunctionReturnType<Mutation>>;
  query<Query extends RootQuery>(
    query: Query,
    args: SerializedPdsRequest,
  ): Promise<FunctionReturnType<Query>>;
  subscribe<Query extends RootQuery>(
    query: Query,
    args: SerializedPdsRequest,
    onResult: (result: FunctionReturnType<Query>) => void,
    onError: (error: Error) => void,
  ): () => void;
}

export class PdsClient {
  readonly #connection;
  readonly #mutation;
  readonly #query;

  constructor(options: {
    readonly connection: PdsConnection;
    readonly mutation?: RootMutation;
    readonly query?: RootQuery;
  }) {
    this.#connection = options.connection;
    this.#mutation = options.mutation ?? pdsFunctions.mutation;
    this.#query = options.query ?? pdsFunctions.query;
  }

  mutation<Request extends AnyPdsMutationRequest>(
    request: Request,
  ): Promise<PdsRequestResult<Request>> {
    // The request's phantom result is defined by the same protocol that created its payload.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return this.#connection.mutation(this.#mutation, request) as Promise<
      PdsRequestResult<Request>
    >;
  }

  query<Request extends AnyPdsQueryRequest>(
    request: Request,
  ): Promise<PdsRequestResult<Request>> {
    // The request's phantom result is defined by the same protocol that created its payload.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return this.#connection.query(this.#query, request) as Promise<
      PdsRequestResult<Request>
    >;
  }

  watchQuery<Request extends AnyPdsQueryRequest>(
    request: Request,
    onResult: (result: PdsRequestResult<Request>) => void,
    onError: (error: Error) => void,
  ) {
    return this.#connection.subscribe(
      this.#query,
      request,
      // The subscription uses the same typed request and root query as the point query path.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      (result) => onResult(result as PdsRequestResult<Request>),
      onError,
    );
  }

  bind<const Api extends BindablePdsApi>(api: Api): BoundPdsApi<Api> {
    const bound = Object.fromEntries(
      Object.entries(api).map(([name, plugin]) => [
        name,
        {
          mutation: bindRequests(plugin.mutations, (request) =>
            this.mutation(request),
          ),
          query: bindRequests(plugin.queries, (request) => this.query(request)),
          watch: bindWatches(plugin.queries, this),
        },
      ]),
    );

    // The bound methods are constructed directly from every request builder in the supplied API.
    const erased: unknown = bound;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return erased as BoundPdsApi<Api>;
  }
}

function defineRequestBuilders(
  plugin: string,
  version: string,
  operations: OperationMap,
): Readonly<
  Record<string, (args: Record<string, unknown>) => SerializedPdsRequest>
> {
  return Object.freeze(
    Object.fromEntries(
      Object.keys(operations).map((type) => [
        type,
        (args: Record<string, unknown>) => ({
          operation: { args, type },
          plugin,
          version,
        }),
      ]),
    ),
  );
}

type MutationRequestBuilder = (...args: never[]) => AnyPdsMutationRequest;
type QueryRequestBuilder = (...args: never[]) => AnyPdsQueryRequest;

interface BindablePdsPlugin {
  readonly mutations: Readonly<Record<string, MutationRequestBuilder>>;
  readonly queries: Readonly<Record<string, QueryRequestBuilder>>;
}

type BindablePdsApi = Readonly<Record<string, BindablePdsPlugin>>;

type BoundRequests<
  Builders extends Readonly<
    Record<string, MutationRequestBuilder | QueryRequestBuilder>
  >,
> = {
  readonly [Name in keyof Builders]: (
    args: Parameters<Builders[Name]>[0],
  ) => Promise<PdsRequestResult<ReturnType<Builders[Name]>>>;
};

type BoundWatches<
  Builders extends Readonly<Record<string, QueryRequestBuilder>>,
> = {
  readonly [Name in keyof Builders]: (
    args: Parameters<Builders[Name]>[0],
    onResult: (result: PdsRequestResult<ReturnType<Builders[Name]>>) => void,
    onError: (error: Error) => void,
  ) => () => void;
};

export type BoundPdsApi<Api extends BindablePdsApi> = {
  readonly [PluginName in keyof Api]: {
    readonly mutation: BoundRequests<Api[PluginName]["mutations"]>;
    readonly query: BoundRequests<Api[PluginName]["queries"]>;
    readonly watch: BoundWatches<Api[PluginName]["queries"]>;
  };
};

function bindRequests<
  const Builders extends Readonly<
    Record<string, MutationRequestBuilder | QueryRequestBuilder>
  >,
>(
  builders: Builders,
  execute: (request: ReturnType<Builders[keyof Builders]>) => Promise<unknown>,
) {
  return Object.fromEntries(
    Object.entries(builders).map(([name, build]) => {
      // Object.entries erases each operation's argument type after BoundRequests captures it.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const buildRequest = build as (
        args: Record<string, unknown>,
      ) => ReturnType<Builders[keyof Builders]>;
      return [
        name,
        (args: Record<string, unknown>) => execute(buildRequest(args)),
      ];
    }),
  );
}

function bindWatches<
  const Builders extends Readonly<Record<string, QueryRequestBuilder>>,
>(builders: Builders, client: PdsClient) {
  return Object.fromEntries(
    Object.entries(builders).map(([name, build]) => {
      // Object.entries erases each operation's argument type after BoundWatches captures it.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const buildRequest = build as (
        args: Record<string, unknown>,
      ) => ReturnType<Builders[keyof Builders]>;
      return [
        name,
        (
          args: Record<string, unknown>,
          onResult: (result: unknown) => void,
          onError: (error: Error) => void,
        ) => client.watchQuery(buildRequest(args), onResult, onError),
      ];
    }),
  );
}

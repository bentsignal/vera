import type { FunctionReference, FunctionReturnType } from "convex/server";
import { makeFunctionReference } from "convex/server";

import type {
  AnyPdsMutationRequest,
  AnyPdsQueryRequest,
  PdsRequestResult,
  SerializedPdsRequest,
} from "./api.ts";

export { definePdsApi } from "./api.ts";
export type {
  AnyPdsMutationRequest,
  AnyPdsQueryRequest,
  DefaultCombinedPdsResult,
  FederatedPdsQueryOptions,
  PdsApi,
  PdsPluginApi,
  PdsRequest,
  PdsRequestResult,
} from "./api.ts";

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

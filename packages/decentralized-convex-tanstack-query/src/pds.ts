import type {
  AnyPdsMutationRequest,
  AnyPdsQueryRequest,
  DecentralizedConvexClient,
  DefaultCombinedPdsResult,
  PdsQueryData,
  PdsRequest,
  PdsRequestResult,
} from "@decentralized-convex/client";
import type {
  DefinedInitialDataOptions,
  Query,
  QueryClient,
  QueryMeta,
  UseMutationOptions,
} from "@tanstack/react-query";
import { mutationOptions } from "@tanstack/react-query";
import { pdsQueryDataFromSnapshot } from "@decentralized-convex/client";

const PDS_QUERY_META_KEY = "decentralizedConvexPdsQuery";
const connectedClients = new WeakMap<QueryClient, PdsQueryClient>();

interface ActiveQuery {
  cancelled: boolean;
  close?: () => void;
}

/**
 * Connects decentralized Convex transport to an application-owned TanStack
 * QueryClient. Application queries still use TanStack's own hooks.
 */
export class PdsQueryClient {
  readonly #activeQueries = new Map<string, ActiveQuery>();
  readonly #client;
  readonly #connections = new Map<QueryClient, () => void>();

  constructor(client: DecentralizedConvexClient) {
    this.#client = client;
  }

  connect(queryClient: QueryClient) {
    const connected = connectedClients.get(queryClient);
    if (connected !== undefined && connected !== this) {
      throw new Error(
        "This TanStack QueryClient is already connected to another PdsQueryClient",
      );
    }
    if (this.#connections.has(queryClient)) return () => undefined;
    if (this.#connections.size > 0) {
      throw new Error(
        "A PdsQueryClient can connect to only one TanStack QueryClient",
      );
    }

    connectedClients.set(queryClient, this);
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        (event.type === "observerAdded" ||
          event.type === "observerOptionsUpdated") &&
        event.query.isActive()
      ) {
        // TanStack's cache event intentionally erases each query's generics.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        this.#startQuery(queryClient, event.query);
      }
      if (
        ((event.type === "observerRemoved" ||
          event.type === "observerOptionsUpdated") &&
          !event.query.isActive()) ||
        event.type === "removed"
      ) {
        this.#stopQuery(event.query.queryHash);
      }
    });
    this.#connections.set(queryClient, unsubscribe);

    for (const query of queryClient.getQueryCache().getAll()) {
      if (query.isActive()) this.#startQuery(queryClient, query);
    }

    return () => this.disconnect(queryClient);
  }

  disconnect(queryClient: QueryClient) {
    const unsubscribe = this.#connections.get(queryClient);
    if (unsubscribe === undefined) return;
    unsubscribe();
    this.#connections.delete(queryClient);
    if (connectedClients.get(queryClient) === this) {
      connectedClients.delete(queryClient);
    }
    if (this.#connections.size === 0) {
      for (const queryHash of this.#activeQueries.keys()) {
        this.#stopQuery(queryHash);
      }
    }
  }

  async query<Request extends AnyPdsQueryRequest>(
    request: Request,
  ): Promise<
    PdsQueryData<DefaultCombinedPdsResult<Request>, PdsRequestResult<Request>>
  > {
    try {
      const snapshot = await this.#client.pdsQuery(request);
      return pdsQueryDataFromSnapshot(snapshot);
    } catch (error) {
      return {
        error: toError(error),
        federation: { sources: [], status: "error" },
        status: "error",
      };
    }
  }

  async mutate<Request extends AnyPdsMutationRequest>(
    request: Request,
  ): Promise<PdsRequestResult<Request>> {
    return this.#client.pdsMutation(request);
  }

  #startQuery(queryClient: QueryClient, query: Query) {
    const request = pdsRequestFromMeta(query.meta);
    if (request === undefined || this.#activeQueries.has(query.queryHash)) {
      return;
    }

    const active: ActiveQuery = { cancelled: false };
    this.#activeQueries.set(query.queryHash, active);
    const observer = this.#client.watchPdsQuery(request);
    function publish() {
      const snapshot = observer.getSnapshot();
      queryClient.setQueryData(
        query.queryKey,
        pdsQueryDataFromSnapshot(snapshot),
      );
    }
    const unsubscribe = observer.subscribe(publish);
    active.close = () => {
      unsubscribe();
      observer.close();
    };
    publish();
  }

  #stopQuery(queryHash: string) {
    const active = this.#activeQueries.get(queryHash);
    if (active === undefined) return;
    active.cancelled = true;
    active.close?.();
    this.#activeQueries.delete(queryHash);
  }
}

export type PdsQueryKey<Request extends AnyPdsQueryRequest> = readonly [
  "decentralized-convex",
  "pds",
  "query",
  Request,
];

type QueryData<Request extends AnyPdsQueryRequest> = PdsQueryData<
  DefaultCombinedPdsResult<Request>,
  PdsRequestResult<Request>
>;

export type PdsQueryOptions<
  Request extends AnyPdsQueryRequest,
  Data = QueryData<Request>,
> = DefinedInitialDataOptions<
  QueryData<Request>,
  Error,
  Data,
  PdsQueryKey<Request>
>;

export interface PdsQueryConfig<
  Args,
  Request extends AnyPdsQueryRequest,
  Data = QueryData<Request>,
> {
  readonly args: Args;
  readonly options?: Omit<
    PdsQueryOptions<Request, Data>,
    "initialData" | "meta" | "queryFn" | "queryKey"
  >;
  readonly query: (args: Args) => Request;
}

export function pdsQuery<
  Args,
  Request extends PdsRequest<unknown, "query">,
  Data = QueryData<Request>,
>({ args, options, query }: PdsQueryConfig<Args, Request, Data>) {
  return pdsQueryOptions(query(args), options);
}

function pdsQueryOptions<
  Request extends AnyPdsQueryRequest,
  Data = QueryData<Request>,
>(
  request: Request,
  options?: PdsQueryConfig<unknown, Request, Data>["options"],
): PdsQueryOptions<Request, Data> {
  const queryKey: PdsQueryKey<typeof request> = [
    "decentralized-convex",
    "pds",
    "query",
    request,
  ];
  const initialData = loadingPdsQueryData<
    DefaultCombinedPdsResult<Request>,
    PdsRequestResult<Request>
  >();
  return {
    initialData,
    meta: { [PDS_QUERY_META_KEY]: request },
    queryFn: ({ client }) => connectedPdsClient(client).query(request),
    queryKey,
    staleTime: (query) =>
      query.state.data?.status === "loading" ? 0 : Infinity,
    ...options,
  };
}

function loadingPdsQueryData<Result, SourceResult>(): PdsQueryData<
  Result,
  SourceResult
> {
  return {
    federation: { sources: [], status: "pending" },
    status: "loading",
  };
}

export interface PdsMutationConfig<
  Args,
  Request extends AnyPdsMutationRequest,
  Context = unknown,
> {
  readonly mutation: (args: Args) => Request;
  readonly options?: Omit<
    UseMutationOptions<PdsRequestResult<Request>, Error, Args, Context>,
    "mutationFn"
  >;
}

export function pdsMutation<
  Args,
  Request extends PdsRequest<unknown, "mutation">,
  Context = unknown,
>({ mutation, options }: PdsMutationConfig<Args, Request, Context>) {
  return mutationOptions<PdsRequestResult<Request>, Error, Args, Context>({
    ...options,
    mutationFn: (args: Args, { client }) =>
      connectedPdsClient(client).mutate(mutation(args)),
  });
}

function connectedPdsClient(queryClient: QueryClient) {
  const client = connectedClients.get(queryClient);
  if (client === undefined) {
    throw new Error(
      "Connect a PdsQueryClient to this TanStack QueryClient before using PDS options",
    );
  }
  return client;
}

function pdsRequestFromMeta(meta: QueryMeta | undefined) {
  const request = meta?.[PDS_QUERY_META_KEY];
  if (
    typeof request !== "object" ||
    request === null ||
    !("plugin" in request) ||
    !("version" in request) ||
    !("operation" in request)
  ) {
    return undefined;
  }
  // Only pdsQuery writes this private metadata entry.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return request as AnyPdsQueryRequest;
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

import type {
  AnyPdsMutationRequest,
  AnyPdsQueryRequest,
  DecentralizedConvexClient,
  DefaultCombinedPdsResult,
  FederatedQuerySnapshot,
  PdsQueryData,
  PdsRequest,
  PdsRequestResult,
} from "@decentralized-convex/client";
import type {
  DefinedInitialDataOptions,
  Query,
  QueryClient,
  QueryKey,
  QueryMeta,
} from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import {
  hashKey,
  mutationOptions,
  useQueryClient,
} from "@tanstack/react-query";
import { pdsQueryDataFromSnapshot } from "@decentralized-convex/client";

const PDS_QUERY_META_KEY = "decentralizedConvexPdsQuery";
const connectedClients = new WeakMap<QueryClient, PdsQueryClient>();

interface ActiveQuery {
  cancelled: boolean;
  close?: () => void;
}

type UnknownSnapshot = FederatedQuerySnapshot<unknown, unknown>;

/**
 * Connects decentralized Convex transport to an application-owned TanStack
 * QueryClient. Application queries still use TanStack's own hooks.
 */
export class PdsQueryClient {
  readonly #activeQueries = new Map<string, ActiveQuery>();
  readonly #client;
  readonly #connections = new Map<QueryClient, () => void>();
  readonly #listeners = new Map<string, Set<() => void>>();
  readonly #snapshots = new Map<string, UnknownSnapshot>();

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
    queryKey: QueryKey,
  ): Promise<PdsQueryData<DefaultCombinedPdsResult<Request>>> {
    try {
      const snapshot = await this.#client.pdsQuery(request);
      this.#publish(hashKey(queryKey), snapshot);
      return pdsQueryDataFromSnapshot(snapshot);
    } catch (error) {
      return { error: toError(error), status: "error" };
    }
  }

  async mutate<Request extends AnyPdsMutationRequest>(
    request: Request,
  ): Promise<PdsRequestResult<Request>> {
    return this.#client.pdsMutation(request);
  }

  getSnapshot<Request extends AnyPdsQueryRequest>(
    request: Request,
    queryKey: QueryKey,
  ): FederatedQuerySnapshot<
    DefaultCombinedPdsResult<Request>,
    PdsRequestResult<Request>
  > {
    const queryHash = hashKey(queryKey);
    let snapshot = this.#snapshots.get(queryHash);
    if (snapshot === undefined) {
      snapshot = {
        data: [],
        sources: [],
        status: "pending",
      };
      this.#snapshots.set(queryHash, snapshot);
    }

    // Snapshots originate from the same typed request stored in this query key.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return snapshot as FederatedQuerySnapshot<
      DefaultCombinedPdsResult<Request>,
      PdsRequestResult<Request>
    >;
  }

  subscribe(queryKey: QueryKey, listener: () => void) {
    const queryHash = hashKey(queryKey);
    const listeners = this.#listeners.get(queryHash) ?? new Set<() => void>();
    listeners.add(listener);
    this.#listeners.set(queryHash, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(queryHash);
    };
  }

  #publish(queryHash: string, snapshot: UnknownSnapshot) {
    this.#snapshots.set(queryHash, snapshot);
    for (const listener of this.#listeners.get(queryHash) ?? []) listener();
  }

  #startQuery(queryClient: QueryClient, query: Query) {
    const request = pdsRequestFromMeta(query.meta);
    if (request === undefined || this.#activeQueries.has(query.queryHash)) {
      return;
    }

    const active: ActiveQuery = { cancelled: false };
    this.#activeQueries.set(query.queryHash, active);
    const observer = this.#client.watchPdsQuery(request);
    const publish = () => {
      const snapshot = observer.getSnapshot();
      this.#publish(hashKey(query.queryKey), snapshot);
      queryClient.setQueryData(
        query.queryKey,
        pdsQueryDataFromSnapshot(snapshot),
      );
    };
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

export type PdsQueryOptions<Request extends AnyPdsQueryRequest> = ReturnType<
  typeof pdsQueryOptions<Request>
>;

export function pdsQuery<Args, Result>(
  operation: (args: Args) => PdsRequest<Result, "query">,
  args: Args,
) {
  return pdsQueryOptions(operation(args));
}

function pdsQueryOptions<Request extends AnyPdsQueryRequest>(request: Request) {
  const queryKey: PdsQueryKey<typeof request> = [
    "decentralized-convex",
    "pds",
    "query",
    request,
  ];
  const initialData =
    loadingPdsQueryData<DefaultCombinedPdsResult<typeof request>>();
  return {
    initialData,
    meta: { [PDS_QUERY_META_KEY]: request },
    queryFn: ({ client }) =>
      connectedPdsClient(client).query(request, queryKey),
    queryKey,
    staleTime: (query) =>
      query.state.data?.status === "loading" ? 0 : Infinity,
  } satisfies DefinedInitialDataOptions<
    PdsQueryData<DefaultCombinedPdsResult<Request>>,
    Error,
    PdsQueryData<DefaultCombinedPdsResult<Request>>,
    PdsQueryKey<Request>
  >;
}

function loadingPdsQueryData<Result>(): PdsQueryData<Result> {
  return { status: "loading" };
}

export function pdsMutation<Args, Result>(
  operation: (args: Args) => PdsRequest<Result, "mutation">,
) {
  return mutationOptions({
    mutationFn: (args: Args, { client }) =>
      connectedPdsClient(client).mutate(operation(args)),
  });
}

export function usePdsQueryState<Request extends AnyPdsQueryRequest>(
  options: { queryKey: PdsQueryKey<Request> },
  queryClientOverride?: QueryClient,
) {
  const queryClient = useQueryClient(queryClientOverride);
  const client = connectedPdsClient(queryClient);
  const request = options.queryKey[3];
  return useSyncExternalStore(
    (listener) => client.subscribe(options.queryKey, listener),
    () => client.getSnapshot(request, options.queryKey),
    () => client.getSnapshot(request, options.queryKey),
  );
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

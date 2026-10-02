import type {
  AnyPdsMutationRequest,
  AnyPdsQueryRequest,
  DecentralizedConvexClient,
  DefaultCombinedPdsResult,
  PdsQueryData,
  PdsQueryExecutionOptions,
  PdsRequestResult,
  SuccessfulPdsQueryData,
} from "@decentralized-convex/client";
import type { Query, QueryClient, QueryMeta } from "@tanstack/react-query";
import { pdsQueryDataFromSnapshot } from "@decentralized-convex/client";

export const PDS_QUERY_META_KEY = "decentralizedConvexPdsQuery";
/** Each QueryClient's connected PDS clients, by session (undefined: none). */
const connectedClients = new WeakMap<
  QueryClient,
  Map<string | undefined, PdsQueryClient>
>();

export interface PdsQueryClientOptions {
  /**
   * Names an account session, so several signed-in accounts can share one
   * QueryClient. Only queries and mutations created with the same `session`
   * run through this client.
   */
  readonly session?: string;
}

export class IncompletePdsQueryError extends Error {
  readonly data: PdsQueryData<unknown, unknown>;

  constructor(data: PdsQueryData<unknown, unknown>) {
    super(incompleteQueryMessage(data));
    this.name = "IncompletePdsQueryError";
    this.data = data;
  }
}

interface ActiveQuery {
  close?: () => void;
}

/** Bridges decentralized Convex transport into an application-owned QueryClient. */
export class PdsQueryClient {
  readonly #activeQueries = new Map<string, ActiveQuery>();
  readonly #client;
  readonly #connections = new Map<QueryClient, () => void>();
  readonly #session;

  constructor(
    client: DecentralizedConvexClient,
    options: PdsQueryClientOptions = {},
  ) {
    this.#client = client;
    this.#session = options.session;
  }

  connect(queryClient: QueryClient) {
    const sessions =
      connectedClients.get(queryClient) ??
      new Map<string | undefined, PdsQueryClient>();
    const connected = sessions.get(this.#session);
    if (connected !== undefined && connected !== this) {
      throw new Error(
        this.#session === undefined
          ? "This TanStack QueryClient is already connected to another PdsQueryClient"
          : `This TanStack QueryClient is already connected to another PdsQueryClient for session ${this.#session}`,
      );
    }
    if (this.#connections.has(queryClient)) return () => undefined;
    if (this.#connections.size > 0) {
      throw new Error(
        "A PdsQueryClient can connect to only one TanStack QueryClient",
      );
    }

    sessions.set(this.#session, this);
    connectedClients.set(queryClient, sessions);
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
    const sessions = connectedClients.get(queryClient);
    if (sessions?.get(this.#session) === this) {
      sessions.delete(this.#session);
      if (sessions.size === 0) connectedClients.delete(queryClient);
    }
    if (this.#connections.size === 0) {
      for (const queryHash of this.#activeQueries.keys()) {
        this.#stopQuery(queryHash);
      }
    }
  }

  async query<Request extends AnyPdsQueryRequest>(
    request: Request,
    options: PdsQueryExecutionOptions,
  ): Promise<
    PdsQueryData<DefaultCombinedPdsResult<Request>, PdsRequestResult<Request>>
  > {
    try {
      const snapshot = await this.#client.pdsQuery(request, options);
      return pdsQueryDataFromSnapshot(snapshot);
    } catch (error) {
      return {
        error: toError(error),
        federation: { sources: [], status: "error" },
        status: "error",
      };
    }
  }

  async queryComplete<Request extends AnyPdsQueryRequest>(
    request: Request,
    options: PdsQueryExecutionOptions,
  ): Promise<
    SuccessfulPdsQueryData<
      DefaultCombinedPdsResult<Request>,
      PdsRequestResult<Request>
    >
  > {
    let data: PdsQueryData<
      DefaultCombinedPdsResult<Request>,
      PdsRequestResult<Request>
    >;
    try {
      data = pdsQueryDataFromSnapshot(
        await this.#client.pdsQuery(request, options),
      );
    } catch (error) {
      data = {
        error: toError(error),
        federation: { sources: [], status: "error" },
        status: "error",
      };
    }
    if (data.status !== "success") throw new IncompletePdsQueryError(data);
    return data;
  }

  async mutate<Request extends AnyPdsMutationRequest>(
    request: Request,
  ): Promise<PdsRequestResult<Request>> {
    return this.#client.pdsMutation(request);
  }

  #startQuery(queryClient: QueryClient, query: Query) {
    const config = pdsQueryConfigFromMeta(query.meta);
    if (
      config === undefined ||
      config.session !== this.#session ||
      this.#activeQueries.has(query.queryHash)
    ) {
      return;
    }

    const active: ActiveQuery = {};
    this.#activeQueries.set(query.queryHash, active);
    const observer = this.#client.watchPdsQuery(config.request, config.options);
    const requireCompleteResults = config.options.requireCompleteResults;
    function publish() {
      const snapshot = observer.getSnapshot();
      if (requireCompleteResults && snapshot.status !== "success") return;
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
    active.close?.();
    this.#activeQueries.delete(queryHash);
  }
}

export function connectedPdsClient(queryClient: QueryClient, session?: string) {
  const client = connectedClients.get(queryClient)?.get(session);
  if (client === undefined) {
    throw new Error(
      session === undefined
        ? "Connect a PdsQueryClient to this TanStack QueryClient before using PDS options"
        : `Connect a PdsQueryClient for session ${session} to this TanStack QueryClient before using its PDS options`,
    );
  }
  return client;
}

function pdsQueryConfigFromMeta(meta: QueryMeta | undefined) {
  const config = meta?.[PDS_QUERY_META_KEY];
  if (
    !isRecord(config) ||
    !("request" in config) ||
    !isPdsQueryRequest(config.request) ||
    !("options" in config) ||
    !isRecord(config.options)
  ) {
    return undefined;
  }
  // Only pdsQuery writes this private metadata entry.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return config as {
    options: PdsQueryExecutionOptions;
    request: AnyPdsQueryRequest;
    session?: string;
  };
}

function isPdsQueryRequest(value: unknown): value is AnyPdsQueryRequest {
  return (
    isRecord(value) &&
    "plugin" in value &&
    "version" in value &&
    "operation" in value
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function incompleteQueryMessage(data: PdsQueryData<unknown, unknown>) {
  if (data.status === "error") return data.error.message;
  const errors = data.federation.sources.flatMap((source) =>
    source.status === "error" ? [source.error.message] : [],
  );
  return errors.length === 0
    ? "The initial PDS query did not return complete results"
    : `The initial PDS query was incomplete: ${errors.join("; ")}`;
}

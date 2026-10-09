import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReference } from "convex/server";

import type {
  AnyPdsQueryRequest,
  PdsRequestResult,
  SerializedPdsRequest,
} from "./api.ts";

type RootQuery = FunctionReference<
  "query",
  "public",
  SerializedPdsRequest,
  { readonly routes: readonly string[]; readonly value: unknown }
>;

/** One loaded query of an operation, as `getAllQueries` returns it. */
export interface PdsOptimisticQuery<Args, Request extends AnyPdsQueryRequest> {
  /** The operation's arguments. */
  readonly args: Args;
  /** The exact request the query was made with, for `setQuery`. */
  readonly request: Request;
  /** Undefined while it loads, or when it failed. */
  readonly value: PdsRequestResult<Request> | undefined;
}

/**
 * The home PDS's query results as a mutation's optimistic update sees them.
 * Like Convex's `OptimisticLocalStore`, but addressed by PDS requests.
 */
export interface PdsOptimisticLocalStore {
  /** Every loaded query of one operation, such as each page of a list. */
  getAllQueries<Args, Request extends AnyPdsQueryRequest>(
    query: (args: Args) => Request,
  ): PdsOptimisticQuery<Args, Request>[];
  /** A query's current result, or undefined while it loads or failed. */
  getQuery<Request extends AnyPdsQueryRequest>(
    request: Request,
  ): PdsRequestResult<Request> | undefined;
  /**
   * Shows `value` as the query's result until the mutation's own result
   * reaches this client, or rolls back when it fails. Undefined shows a
   * query that hasn't loaded yet as still loading.
   */
  setQuery<Request extends AnyPdsQueryRequest>(
    request: Request,
    value: PdsRequestResult<Request> | undefined,
  ): void;
}

/**
 * Changes query results the moment a mutation starts. It may run again
 * whenever new results arrive, so it must only read the store and its
 * arguments, and give the same result each time.
 */
export type PdsOptimisticUpdate = (store: PdsOptimisticLocalStore) => void;

export interface PdsMutationOptions {
  readonly optimisticUpdate?: PdsOptimisticUpdate;
}

/** What a connection's mutation takes to apply an optimistic update. */
export interface PdsConnectionMutationOptions {
  readonly optimisticUpdate?: (store: OptimisticLocalStore) => void;
}

function sameOperation(
  left: SerializedPdsRequest,
  right: SerializedPdsRequest,
) {
  return (
    left.plugin === right.plugin &&
    left.lastChanged === right.lastChanged &&
    left.operation.type === right.operation.type
  );
}

/** Adapts Convex's optimistic store to PDS requests made with `query`. */
export function pdsOptimisticLocalStore(
  store: OptimisticLocalStore,
  query: RootQuery,
): PdsOptimisticLocalStore {
  return {
    getAllQueries<Args, Request extends AnyPdsQueryRequest>(
      build: (args: Args) => Request,
    ) {
      // Request builders only wrap their arguments, so any value names the
      // operation they build.
      const probe: unknown = Reflect.apply(build, undefined, [{}]);
      return store.getAllQueries(query).flatMap(({ args, value }) =>
        isRequest(probe) && sameOperation(args, probe)
          ? [
              // The matching request came from the same builder's protocol.
              /* eslint-disable @typescript-eslint/consistent-type-assertions */
              {
                args: args.operation.args as Args,
                request: args as Request,
                value: value?.value as PdsRequestResult<Request> | undefined,
              },
              /* eslint-enable @typescript-eslint/consistent-type-assertions */
            ]
          : [],
      );
    },
    getQuery<Request extends AnyPdsQueryRequest>(request: Request) {
      // The request's phantom result is defined by the same protocol that created its payload.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      return store.getQuery(query, request)?.value as
        | PdsRequestResult<Request>
        | undefined;
    },
    setQuery(request, value) {
      const routes = store.getQuery(query, request)?.routes ?? [];
      store.setQuery(
        query,
        request,
        value === undefined ? undefined : { routes, value },
      );
    },
  };
}

function isRequest(value: unknown): value is SerializedPdsRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "operation" in value &&
    "plugin" in value
  );
}

import type { QueryRequest } from "@decentralized-convex/plugin";
import type { Value } from "convex/values";

const RoutedQueryResultMarker = Symbol("RoutedQueryResult");

/**
 * The queries a result includes, or a function that works them out, so a
 * query asked for without its includes (a live subscription; see
 * `include` on the router) doesn't read what only they need.
 */
export type IncludedQueries =
  | readonly QueryRequest[]
  | (() => Promise<readonly QueryRequest[]> | readonly QueryRequest[]);

export interface RoutedQueryResult<Result> {
  readonly [RoutedQueryResultMarker]: true;
  readonly data: Result;
  /**
   * Queries the client will ask for next, such as the profiles a result
   * shows. The PDS answers them with this one, so the client has them
   * without another round trip.
   */
  readonly include: IncludedQueries;
  readonly routes: readonly string[];
}

/**
 * A query's result with what else the client needs: `routes`, the accounts
 * whose PDSs also answer it, and `include`, queries answered along with it.
 */
export function queryResult<Result>(
  data: Result,
  {
    include = [],
    routes = [],
  }: {
    readonly include?: IncludedQueries;
    readonly routes?: readonly string[];
  },
): RoutedQueryResult<Result> {
  return { [RoutedQueryResultMarker]: true, data, include, routes };
}

export function routedQueryResult<Result>(
  data: Result,
  routes: readonly string[],
): RoutedQueryResult<Result> {
  return queryResult(data, { routes });
}

export function isRoutedQueryResult(
  value: unknown,
): value is RoutedQueryResult<Value> {
  return (
    typeof value === "object" &&
    value !== null &&
    RoutedQueryResultMarker in value
  );
}

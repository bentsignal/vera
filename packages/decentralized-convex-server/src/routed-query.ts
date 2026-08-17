import type { Value } from "convex/values";

const RoutedQueryResultMarker = Symbol("RoutedQueryResult");

export interface RoutedQueryResult<Result> {
  readonly [RoutedQueryResultMarker]: true;
  readonly data: Result;
  readonly routes: readonly string[];
}

export function routedQueryResult<Result>(
  data: Result,
  routes: readonly string[],
): RoutedQueryResult<Result> {
  return { [RoutedQueryResultMarker]: true, data, routes };
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

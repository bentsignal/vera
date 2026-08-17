import type { FederatedQuerySnapshot } from "./types.ts";

export type PdsQueryData<Result> =
  | { readonly status: "loading" }
  | { readonly result: Result; readonly status: "partial" }
  | { readonly result: Result; readonly status: "success" }
  | { readonly error: Error; readonly status: "error" };

export function pdsQueryDataFromSnapshot<Result>(
  snapshot: FederatedQuerySnapshot<Result, unknown>,
): PdsQueryData<Result> {
  switch (snapshot.status) {
    case "pending":
      return { status: "loading" };
    case "partial":
      return { result: snapshot.data, status: "partial" };
    case "success":
      return { result: snapshot.data, status: "success" };
    case "error":
      return {
        error: new AggregateError(
          snapshot.sources.flatMap((source) =>
            source.status === "error" ? [source.error] : [],
          ),
          "Every PDS query target failed",
        ),
        status: "error",
      };
  }
}

export function mapPdsQueryData<Input, Output>(
  data: PdsQueryData<Input>,
  map: (result: Input) => Output,
): PdsQueryData<Output> {
  switch (data.status) {
    case "loading":
    case "error":
      return data;
    case "partial":
      return { result: map(data.result), status: "partial" };
    case "success":
      return { result: map(data.result), status: "success" };
  }
}

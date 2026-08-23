import type {
  FederatedQuerySnapshot,
  FederatedQueryStatus,
  FederationSourceSnapshot,
} from "./types.ts";

export interface PdsQueryFederation<SourceResult> {
  readonly sources: readonly FederationSourceSnapshot<SourceResult>[];
  readonly status: FederatedQueryStatus;
}

export type PdsQueryData<Result, SourceResult = Result> =
  | {
      readonly federation: PdsQueryFederation<SourceResult>;
      readonly status: "loading";
    }
  | {
      readonly federation: PdsQueryFederation<SourceResult>;
      readonly result: Result;
      readonly status: "partial";
    }
  | {
      readonly federation: PdsQueryFederation<SourceResult>;
      readonly result: Result;
      readonly status: "success";
    }
  | {
      readonly error: Error;
      readonly federation: PdsQueryFederation<SourceResult>;
      readonly status: "error";
    };

export type SuccessfulPdsQueryData<Result, SourceResult = Result> = Extract<
  PdsQueryData<Result, SourceResult>,
  { readonly status: "success" }
>;

export function pdsQueryDataFromSnapshot<Result, SourceResult>(
  snapshot: FederatedQuerySnapshot<Result, SourceResult>,
): PdsQueryData<Result, SourceResult> {
  const federation = {
    sources: snapshot.sources,
    status: snapshot.status,
  };
  switch (snapshot.status) {
    case "pending":
      return { federation, status: "loading" };
    case "partial":
      return { federation, result: snapshot.data, status: "partial" };
    case "success":
      return { federation, result: snapshot.data, status: "success" };
    case "error":
      return {
        error: new AggregateError(
          snapshot.sources.flatMap((source) =>
            source.status === "error" ? [source.error] : [],
          ),
          "Every PDS query target failed",
        ),
        federation,
        status: "error",
      };
  }
}

export function mapPdsQueryData<Input, Output, SourceResult>(
  data: PdsQueryData<Input, SourceResult>,
  map: (result: Input) => Output,
): PdsQueryData<Output, SourceResult> {
  switch (data.status) {
    case "loading":
    case "error":
      return data;
    case "partial":
      return {
        federation: data.federation,
        result: map(data.result),
        status: "partial",
      };
    case "success":
      return {
        federation: data.federation,
        result: map(data.result),
        status: "success",
      };
  }
}

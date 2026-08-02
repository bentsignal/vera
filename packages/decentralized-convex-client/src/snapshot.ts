import type {
  DefaultCombinedResult,
  FederatedQuerySnapshot,
  FederationSourceSnapshot,
  SuccessfulFederationSource,
} from "./types.ts";

export function createFederatedSnapshot<Result, Combined>(
  sources: readonly FederationSourceSnapshot<Result>[],
  combine?: (
    sources: readonly SuccessfulFederationSource<Result>[],
  ) => Combined,
): FederatedQuerySnapshot<Combined, Result> {
  const successful = sources.flatMap((source) =>
    source.status === "live" && source.data !== undefined
      ? [{ data: source.data, target: source.target }]
      : [],
  );
  const data =
    combine === undefined
      ? // The default combiner's conditional return type cannot be proven for an open generic.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        (defaultCombine(successful) as Combined)
      : combine(successful);

  return {
    data,
    sources,
    status: getStatus(sources),
  };
}

export function defaultCombine<Result>(
  sources: readonly SuccessfulFederationSource<Result>[],
) {
  const values = sources.map((source) => source.data);
  if (values.every((value) => Array.isArray(value))) {
    // Runtime array narrowing does not resolve a conditional generic return type.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return values.flat() as DefaultCombinedResult<Result>;
  }
  // The non-array branch is the other side of the same conditional generic.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return values as DefaultCombinedResult<Result>;
}

function getStatus<Result>(
  sources: readonly FederationSourceSnapshot<Result>[],
) {
  if (sources.length === 0) return "success";
  const live = sources.filter((source) => source.status === "live").length;
  const errors = sources.filter((source) => source.status === "error").length;
  if (live === sources.length) return "success";
  if (errors === sources.length) return "error";
  if (live > 0) return "partial";
  return "pending";
}

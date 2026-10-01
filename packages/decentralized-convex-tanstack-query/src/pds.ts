import type {
  AnyPdsMutationRequest,
  AnyPdsQueryRequest,
  DefaultCombinedPdsResult,
  PdsQueryData,
  PdsQueryExecutionOptions,
  PdsRequest,
  PdsRequestResult,
  SuccessfulPdsQueryData,
} from "@decentralized-convex/client";
import type {
  DefinedInitialDataOptions,
  Query,
  QueryClient,
  UseMutationOptions,
  UseSuspenseQueryOptions,
} from "@tanstack/react-query";
import { mutationOptions } from "@tanstack/react-query";

import { connectedPdsClient, PDS_QUERY_META_KEY } from "./pds-query-client.ts";

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

type CompleteQueryData<Request extends AnyPdsQueryRequest> =
  SuccessfulPdsQueryData<
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

export type PdsQueryBuilderOptions<
  Request extends AnyPdsQueryRequest,
  Data = QueryData<Request>,
> = Omit<
  PdsQueryOptions<Request, Data>,
  "initialData" | "meta" | "queryFn" | "queryKey"
> &
  Omit<PdsQueryExecutionOptions, "requireCompleteResults"> & {
    readonly requireCompleteResults?: false;
  };

export type CompletePdsQueryOptions<
  Request extends AnyPdsQueryRequest,
  Data = CompleteQueryData<Request>,
> = UseSuspenseQueryOptions<
  CompleteQueryData<Request>,
  Error,
  Data,
  PdsQueryKey<Request>
>;

export type CompletePdsQueryBuilderOptions<
  Request extends AnyPdsQueryRequest,
  Data = CompleteQueryData<Request>,
> = Omit<
  CompletePdsQueryOptions<Request, Data>,
  "initialData" | "meta" | "queryFn" | "queryKey"
> &
  Omit<PdsQueryExecutionOptions, "requireCompleteResults"> & {
    readonly requireCompleteResults: true;
  };

export interface PdsQueryConfig<
  Args,
  Request extends AnyPdsQueryRequest,
  Data = QueryData<Request>,
> {
  readonly args: Args;
  readonly options?: PdsQueryBuilderOptions<Request, Data>;
  readonly query: (args: Args) => Request;
}

export interface CompletePdsQueryConfig<
  Args,
  Request extends AnyPdsQueryRequest,
  Data = CompleteQueryData<Request>,
> {
  readonly args: Args;
  readonly options: CompletePdsQueryBuilderOptions<Request, Data>;
  readonly query: (args: Args) => Request;
}

export function pdsQuery<
  Args,
  Request extends PdsRequest<unknown, "query">,
  Data = CompleteQueryData<Request>,
>(
  config: CompletePdsQueryConfig<Args, Request, Data>,
): CompletePdsQueryOptions<Request, Data>;
export function pdsQuery<
  Args,
  Request extends PdsRequest<unknown, "query">,
  Data = QueryData<Request>,
>(config: PdsQueryConfig<Args, Request, Data>): PdsQueryOptions<Request, Data>;
export function pdsQuery<
  Args,
  Request extends PdsRequest<unknown, "query">,
  Data,
>({
  args,
  options,
  query,
}:
  | CompletePdsQueryConfig<Args, Request, Data>
  | PdsQueryConfig<Args, Request, Data>):
  | CompletePdsQueryOptions<Request, Data>
  | PdsQueryOptions<Request, Data> {
  // The overloads preserve whether the literal strict flag was supplied.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return pdsQueryOptions(query(args), options) as
    | CompletePdsQueryOptions<Request, Data>
    | PdsQueryOptions<Request, Data>;
}

function pdsQueryOptions<Request extends AnyPdsQueryRequest>(
  request: Request,
  options?:
    | CompletePdsQueryBuilderOptions<Request, unknown>
    | PdsQueryBuilderOptions<Request, unknown>,
) {
  const {
    initialResponseTimeout,
    requireCompleteResults,
    revealPartialResultsAfter,
    ...tanStackOptions
  } = options ?? {};
  const executionOptions: PdsQueryExecutionOptions = {
    ...(initialResponseTimeout === undefined ? {} : { initialResponseTimeout }),
    ...(requireCompleteResults === undefined ? {} : { requireCompleteResults }),
    ...(revealPartialResultsAfter === undefined
      ? {}
      : { revealPartialResultsAfter }),
  };
  const queryKey: PdsQueryKey<typeof request> = [
    "decentralized-convex",
    "pds",
    "query",
    request,
  ];
  const sharedOptions = {
    meta: {
      [PDS_QUERY_META_KEY]: { options: executionOptions, request },
    },
    queryKey,
    ...tanStackOptions,
  };
  if (requireCompleteResults) {
    return {
      ...sharedOptions,
      queryFn: ({ client }: { client: QueryClient }) =>
        connectedPdsClient(client).queryComplete(request, executionOptions),
      staleTime: tanStackOptions.staleTime ?? Infinity,
    };
  }
  return {
    ...sharedOptions,
    initialData: loadingPdsQueryData<
      DefaultCombinedPdsResult<Request>,
      PdsRequestResult<Request>
    >(),
    queryFn: ({ client }: { client: QueryClient }) =>
      connectedPdsClient(client).query(request, executionOptions),
    staleTime:
      tanStackOptions.staleTime ??
      ((query: Query<unknown, Error, QueryData<Request>>) =>
        query.state.data?.status === "loading" ? 0 : Infinity),
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

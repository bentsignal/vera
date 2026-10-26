import type {
  AnsweredQuery,
  OperationMap,
  OperationRequest,
  OperationResult,
  QueryRequest,
} from "@decentralized-convex/plugin";
import type { GenericDataModel, GenericQueryCtx } from "convex/server";
import { ConvexError } from "convex/values";

import type { DispatcherComponents } from "./dispatcher-types.ts";
import type {
  DispatcherIdentity,
  QueryOperationHandlers,
} from "./dispatcher.ts";
import type { IncludedQuery, RoutedQueryResult } from "./routed-query.ts";
import { isRoutedQueryResult } from "./routed-query.ts";

// Answering queries, and the queries their results include (see
// `queryResult`).

type MaybePromise<Value> = Promise<Value> | Value;

/** At most this many queries are answered along with another. */
const MAX_INCLUDED_QUERIES = 200;

function isAnswered(entry: IncludedQuery): entry is AnsweredQuery {
  return "request" in entry;
}

/**
 * A query handler's result as its component answers it, with what it
 * includes unless `include` is false (see the router's `include`).
 */
export async function queryResponse(
  type: string,
  result: unknown,
  include = true,
) {
  if (!isRoutedQueryResult(result)) return { type, value: result };
  const included = !include
    ? []
    : typeof result.include === "function"
      ? await result.include()
      : result.include;
  const answered = included.filter(isAnswered);
  const requests = included.filter((entry) => !isAnswered(entry));
  return {
    ...(answered.length > 0 ? { answered } : {}),
    ...(requests.length > 0 ? { include: requests } : {}),
    routes: result.routes,
    type,
    value: result.data,
  };
}

/**
 * A component's answers to several queries, for the router to answer what
 * another query's result includes. One this plugin doesn't have (or that
 * fails) answers null rather than failing the rest.
 */
export function dispatchRequests<Queries extends OperationMap, Context>(
  handlers: QueryOperationHandlers<Queries, Context>,
  protocol: { readonly lastChanged: string; readonly name: string },
  ctx: Context,
  identity: DispatcherIdentity | null,
  requests: readonly QueryRequest[],
) {
  return Promise.all(
    requests.map(async (request) => {
      if (
        request.plugin !== protocol.name ||
        request.lastChanged !== protocol.lastChanged ||
        !Object.hasOwn(handlers, request.operation.type)
      ) {
        return null;
      }
      // Only the router calls this, with requests this PDS's plugins
      // built, so their arguments are already well formed.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const operation = request.operation as OperationRequest<Queries>;
      try {
        // Answered as what another query includes: nothing more is.
        return await queryResponse(
          operation.type,
          await invokeQueryOperation(handlers, ctx, identity, operation),
          false,
        );
      } catch {
        return null;
      }
    }),
  );
}

/**
 * What a query's result comes with: the included queries it answered
 * itself, as it worked out its own, and the PDS's answers to the rest.
 */
export async function includedWith(
  ctx: Pick<GenericQueryCtx<GenericDataModel>, "runQuery">,
  components: DispatcherComponents,
  identity: DispatcherIdentity | null,
  response: {
    readonly answered?: readonly {
      readonly request: QueryRequest;
      readonly routes?: readonly string[];
      readonly value: unknown;
    }[];
    readonly include?: readonly QueryRequest[];
  },
) {
  return [
    ...(response.answered ?? []).map(({ request, routes, value }) => ({
      request,
      routes: routes ?? [],
      value,
    })),
    ...(await answerIncluded(
      ctx,
      components,
      identity,
      response.include ?? [],
    )),
  ];
}

/**
 * Answers the queries a result includes, one call per plugin, so the
 * client gets them in the same round trip. A plugin that isn't installed,
 * predates included queries, or fails leaves its queries out; the client
 * then asks for them as usual.
 */
export async function answerIncluded(
  ctx: Pick<GenericQueryCtx<GenericDataModel>, "runQuery">,
  components: DispatcherComponents,
  identity: DispatcherIdentity | null,
  include: readonly QueryRequest[],
) {
  const byPlugin = new Map<string, QueryRequest[]>();
  for (const request of include.slice(0, MAX_INCLUDED_QUERIES)) {
    byPlugin.set(request.plugin, [
      ...(byPlugin.get(request.plugin) ?? []),
      request,
    ]);
  }
  const answered = await Promise.all(
    [...byPlugin].map(async ([plugin, requests]) => {
      const dispatchQueries = components[plugin]?.dispatcher.dispatchQueries;
      if (dispatchQueries === undefined) return [];
      try {
        const responses = await ctx.runQuery(dispatchQueries, {
          identity,
          requests,
        });
        return requests.flatMap((request, index) => {
          const response = responses[index];
          return response == null
            ? []
            : [
                {
                  request,
                  routes: response.routes ?? [],
                  value: response.value,
                },
              ];
        });
      } catch {
        return [];
      }
    }),
  );
  return answered.flat();
}

export function invokeQueryOperation<Operations extends OperationMap, Context>(
  handlers: QueryOperationHandlers<Operations, Context>,
  ctx: Context,
  identity: DispatcherIdentity | null,
  operation: OperationRequest<Operations>,
): MaybePromise<
  | OperationResult<Operations[keyof Operations]>
  | RoutedQueryResult<OperationResult<Operations[keyof Operations]>>
> {
  const handler = handlers[operation.type];
  if (typeof handler !== "function") {
    throw new ConvexError({
      code: "UNKNOWN_PLUGIN_OPERATION",
      operation: operation.type,
    });
  }

  return Reflect.apply(handler, undefined, [
    ctx,
    { args: operation.args, identity },
  ]);
}

import type {
  OperationArgs,
  OperationMap,
  OperationRequest,
  OperationResponse,
  OperationResult,
  PluginProtocol,
  PluginRequirements,
} from "@decentralized-convex/plugin";
import type {
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
  ValidatorTypeToReturnType,
} from "convex/server";
import {
  operationResponseValidator,
  operationValidator,
  queryRequestValidator,
  queryResponseValidator,
} from "@decentralized-convex/plugin";
import { ConvexError, v } from "convex/values";

import type { RoutedQueryResult } from "./routed-query.ts";
import {
  dispatchRequests,
  invokeQueryOperation,
  queryResponse,
} from "./query-dispatch.ts";

export interface DispatcherIdentity {
  readonly [key: string]: string | undefined;
  readonly accountId?: string;
  readonly email?: string;
  readonly issuer: string;
  readonly name?: string;
  readonly subject: string;
  readonly tokenIdentifier: string;
}

const dispatcherIdentity = v.object({
  accountId: v.optional(v.string()),
  email: v.optional(v.string()),
  issuer: v.string(),
  name: v.optional(v.string()),
  subject: v.string(),
  tokenIdentifier: v.string(),
});

const componentDispatcherArgs = {
  identity: v.union(v.null(), dispatcherIdentity),
  operation: v.any(),
};

type MaybePromise<Value> = Promise<Value> | Value;

export interface OperationHandlerContext<Args> {
  readonly args: Args;
  readonly identity: DispatcherIdentity | null;
}

export type OperationHandlers<Operations extends OperationMap, Context> = {
  readonly [Name in keyof Operations]: (
    ctx: Context,
    request: OperationHandlerContext<OperationArgs<Operations[Name]>>,
  ) => MaybePromise<OperationResult<Operations[Name]>>;
};

export type QueryOperationHandlers<Operations extends OperationMap, Context> = {
  readonly [Name in keyof Operations]: (
    ctx: Context,
    request: OperationHandlerContext<OperationArgs<Operations[Name]>>,
  ) => MaybePromise<
    | OperationResult<Operations[Name]>
    | RoutedQueryResult<OperationResult<Operations[Name]>>
  >;
};

export function defineComponentDispatchers<
  DataModel extends GenericDataModel,
  const Name extends string,
  const Version extends string,
  const Queries extends OperationMap,
  const Mutations extends OperationMap,
  const Requirements extends PluginRequirements,
>({
  handlers,
  mutation,
  protocol,
  query,
}: {
  readonly handlers: {
    readonly mutations: OperationHandlers<
      Mutations,
      GenericMutationCtx<DataModel>
    >;
    readonly queries: QueryOperationHandlers<
      Queries,
      GenericQueryCtx<DataModel>
    >;
  };
  readonly mutation: MutationBuilder<DataModel, "public">;
  readonly protocol: PluginProtocol<
    Name,
    Version,
    Queries,
    Mutations,
    Requirements
  >;
  readonly query: QueryBuilder<DataModel, "public">;
}) {
  const queryOperation = operationValidator(protocol.queries);
  const mutationOperation = operationValidator(protocol.mutations);
  const queryReturns = queryResponseValidator(protocol.queries);
  const mutationReturns = operationResponseValidator(protocol.mutations);

  return {
    dispatchMutation: mutation({
      args: {
        identity: componentDispatcherArgs.identity,
        lastChanged: v.literal(protocol.lastChanged),
        operation: mutationOperation,
        version: v.string(),
      },
      returns: mutationReturns,
      handler: async (ctx, { identity, operation }) =>
        // Convex applies a top-level nullability transform that cannot be proven for an open union.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        ({
          type: operation.type,
          value: await invokeOperation(
            handlers.mutations,
            ctx,
            identity,
            operation,
          ),
        }) as ValidatorTypeToReturnType<OperationResponse<Mutations>>,
    }),
    dispatchQuery: query({
      args: {
        identity: componentDispatcherArgs.identity,
        lastChanged: v.literal(protocol.lastChanged),
        operation: queryOperation,
        version: v.string(),
      },
      returns: queryReturns,
      handler: async (ctx, { identity, operation }) =>
        // Convex applies a top-level nullability transform that cannot be proven for an open union.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        queryResponse(
          operation.type,
          await invokeQueryOperation(
            handlers.queries,
            ctx,
            identity,
            operation,
          ),
        ) as ValidatorTypeToReturnType<OperationResponse<Queries>>,
    }),
    /**
     * Several queries in one call, for the router to answer what another
     * query's result includes. One this plugin doesn't have (or that
     * fails) answers null rather than failing the rest.
     */
    dispatchQueries: query({
      args: {
        identity: componentDispatcherArgs.identity,
        requests: v.array(queryRequestValidator),
      },
      returns: v.array(v.union(v.null(), queryReturns)),
      handler: async (ctx, { identity, requests }) =>
        // Convex applies a top-level nullability transform that cannot be proven for an open union.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        (await dispatchRequests(
          handlers.queries,
          protocol,
          ctx,
          identity,
          requests,
        )) as (OperationResponse<Queries> | null)[],
    }),
  } as const;
}

function invokeOperation<Operations extends OperationMap, Context>(
  handlers: OperationHandlers<Operations, Context>,
  ctx: Context,
  identity: DispatcherIdentity | null,
  operation: OperationRequest<Operations>,
): MaybePromise<OperationResult<Operations[keyof Operations]>> {
  const handler = handlers[operation.type];
  if (typeof handler !== "function") {
    throw new ConvexError({
      code: "UNKNOWN_PLUGIN_OPERATION",
      operation: operation.type,
    });
  }

  // The discriminated operation validator guarantees this handler receives its matching args.
  return Reflect.apply(handler, undefined, [
    ctx,
    { args: operation.args, identity },
  ]);
}

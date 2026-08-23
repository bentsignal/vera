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
  Auth,
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
} from "@decentralized-convex/plugin";
import { ConvexError, v } from "convex/values";

import type { DispatcherComponents } from "./dispatcher-types.ts";
import type { RoutedQueryResult } from "./routed-query.ts";
import { isRoutedQueryResult } from "./routed-query.ts";

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
  const queryReturns = operationResponseValidator(protocol.queries);
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
      handler: async (ctx, { identity, operation }) => {
        const result = await invokeQueryOperation(
          handlers.queries,
          ctx,
          identity,
          operation,
        );
        // Convex applies a top-level nullability transform that cannot be proven for an open union.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        return {
          ...(isRoutedQueryResult(result) ? { routes: result.routes } : {}),
          type: operation.type,
          value: isRoutedQueryResult(result) ? result.data : result,
        } as ValidatorTypeToReturnType<OperationResponse<Queries>>;
      },
    }),
  } as const;
}

export function definePdsRouter<DataModel extends GenericDataModel>({
  components,
  mutation,
  query,
}: {
  readonly components: unknown;
  readonly mutation: MutationBuilder<DataModel, "public">;
  readonly query: QueryBuilder<DataModel, "public">;
}) {
  const installed = readDispatcherComponents(components);
  return {
    dispatchMutation: mutation({
      args: {
        lastChanged: v.string(),
        operation: v.any(),
        plugin: v.string(),
        version: v.string(),
      },
      returns: v.any(),
      handler: async (ctx, request) => {
        const component = getDispatcherComponent(installed, request.plugin);
        const identity = await resolveIdentity(ctx);
        const response = await ctx.runMutation(component.mutation, {
          identity,
          lastChanged: request.lastChanged,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          operation: request.operation,
          version: request.version,
        });
        return response.value;
      },
    }),
    dispatchQuery: query({
      args: {
        lastChanged: v.string(),
        operation: v.any(),
        plugin: v.string(),
        version: v.string(),
      },
      returns: v.any(),
      handler: async (ctx, request) => {
        const component = getDispatcherComponent(installed, request.plugin);
        const identity = await resolveIdentity(ctx);
        const response = await ctx.runQuery(component.query, {
          identity,
          lastChanged: request.lastChanged,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          operation: request.operation,
          version: request.version,
        });
        return {
          routes: response.routes ?? [],
          value: response.value,
        };
      },
    }),
  } as const;
}

function invokeQueryOperation<Operations extends OperationMap, Context>(
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

function readDispatcherComponents(components: unknown): DispatcherComponents {
  // Convex generates `components` as a lazy proxy. Computed property access creates the same
  // FunctionReferences as static `components.myPlugin.dispatcher.*` access.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return components as DispatcherComponents;
}

function getDispatcherComponent(
  components: DispatcherComponents,
  plugin: string,
) {
  const component = components[plugin];
  if (component === undefined) {
    throw new ConvexError({ code: "PLUGIN_NOT_INSTALLED", plugin });
  }
  return {
    mutation: component.dispatcher.dispatchMutation,
    query: component.dispatcher.dispatchQuery,
  };
}

async function resolveIdentity(ctx: {
  readonly auth: Auth;
}): Promise<DispatcherIdentity | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity === null
    ? null
    : {
        ...(typeof identity.accountId === "string"
          ? { accountId: identity.accountId }
          : {}),
        issuer: identity.issuer,
        ...(identity.email === undefined ? {} : { email: identity.email }),
        ...(identity.name === undefined ? {} : { name: identity.name }),
        subject: identity.subject,
        tokenIdentifier: identity.tokenIdentifier,
      };
}

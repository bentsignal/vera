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
  FunctionReference,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
  ValidatorTypeToReturnType,
} from "convex/server";
import type { Value } from "convex/values";
import {
  operationResponseValidator,
  operationValidator,
} from "@decentralized-convex/plugin";
import { ConvexError, v } from "convex/values";

export interface DispatcherIdentity {
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
    readonly queries: OperationHandlers<Queries, GenericQueryCtx<DataModel>>;
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
        operation: mutationOperation,
        version: v.literal(protocol.version),
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
        operation: queryOperation,
        version: v.literal(protocol.version),
      },
      returns: queryReturns,
      handler: async (ctx, { identity, operation }) =>
        // Convex applies a top-level nullability transform that cannot be proven for an open union.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        ({
          type: operation.type,
          value: await invokeOperation(
            handlers.queries,
            ctx,
            identity,
            operation,
          ),
        }) as ValidatorTypeToReturnType<OperationResponse<Queries>>,
    }),
  } as const;
}

type ComponentQuery = FunctionReference<
  "query",
  "internal" | "public",
  // Component operation unions differ by plugin and are erased only inside the trusted router.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { identity: DispatcherIdentity | null; operation: any; version: string },
  DispatcherResponse
>;

type ComponentMutation = FunctionReference<
  "mutation",
  "internal" | "public",
  // Component operation unions differ by plugin and are erased only inside the trusted router.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { identity: DispatcherIdentity | null; operation: any; version: string },
  DispatcherResponse
>;

interface DispatcherResponse {
  readonly type: string;
  readonly value: Value;
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
      args: { operation: v.any(), plugin: v.string(), version: v.string() },
      returns: v.any(),
      handler: async (ctx, request) => {
        const component = getDispatcherComponent(installed, request.plugin);
        const identity = await resolveIdentity(ctx);
        const response = await ctx.runMutation(component.mutation, {
          identity,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          operation: request.operation,
          version: request.version,
        });
        return response.value;
      },
    }),
    dispatchQuery: query({
      args: { operation: v.any(), plugin: v.string(), version: v.string() },
      returns: v.any(),
      handler: async (ctx, request) => {
        const component = getDispatcherComponent(installed, request.plugin);
        const identity = await resolveIdentity(ctx);
        const response = await ctx.runQuery(component.query, {
          identity,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          operation: request.operation,
          version: request.version,
        });
        return response.value;
      },
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

interface DispatcherComponent {
  readonly dispatcher: {
    readonly dispatchMutation: ComponentMutation;
    readonly dispatchQuery: ComponentQuery;
  };
}

type DispatcherComponents = Readonly<Record<string, DispatcherComponent>>;

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

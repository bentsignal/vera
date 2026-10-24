import type {
  Auth,
  GenericDataModel,
  GenericMutationCtx,
  MutationBuilder,
  QueryBuilder,
} from "convex/server";
import { ConvexError, v } from "convex/values";

import type { DispatcherComponents } from "./dispatcher-types.ts";
import type { DispatcherIdentity } from "./dispatcher.ts";
import { answerIncluded } from "./query-dispatch.ts";

// The host's PDS router: every client request passes through it to the
// plugin Component that answers it.

/** A write a client asked for (`beforeMutation`), or once done, with its value (`afterMutation`). */
export interface PdsRouterMutationRequest {
  readonly identity: DispatcherIdentity | null;
  readonly operation: unknown;
  readonly plugin: string;
}
export type PdsRouterMutation = PdsRouterMutationRequest & { value: unknown };

export function definePdsRouter<DataModel extends GenericDataModel>({
  afterMutation,
  beforeMutation,
  components,
  mutation,
  query,
  trace,
}: {
  /**
   * Runs in the same transaction before each plugin write a client asks
   * for, so the host can refuse it (by throwing) before the plugin works.
   */
  readonly beforeMutation?: (
    ctx: GenericMutationCtx<DataModel>,
    mutation: PdsRouterMutationRequest,
  ) => Promise<void>;
  /**
   * Runs in the same transaction after each successful plugin write, so
   * the host can react to it (schedule work, record something) without
   * changing a plugin's protocol. Writes the host makes to a Component
   * directly don't pass through here.
   */
  readonly afterMutation?: (
    ctx: GenericMutationCtx<DataModel>,
    mutation: PdsRouterMutation,
  ) => Promise<void>;
  readonly components: unknown;
  readonly mutation: MutationBuilder<DataModel, "public">;
  readonly query: QueryBuilder<DataModel, "public">;
  /**
   * Whether to log each request's operation, so the function logs show
   * what each run of the router was for (its cost is in the same log
   * entry). Logs the operation's type and the shape of its arguments,
   * never their values.
   */
  readonly trace?: () => boolean;
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
        if (trace?.() === true) logOperation("mutation", request);
        const identity = await resolveIdentity(ctx);
        await beforeMutation?.(ctx, {
          identity,
          operation: request.operation,
          plugin: request.plugin,
        });
        const response = await ctx.runMutation(component.mutation, {
          identity,
          lastChanged: request.lastChanged,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          operation: request.operation,
          version: request.version,
        });
        await afterMutation?.(ctx, {
          identity,
          operation: request.operation,
          plugin: request.plugin,
          value: response.value,
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
        if (trace?.() === true) logOperation("query", request);
        const identity = await resolveIdentity(ctx);
        const response = await ctx.runQuery(component.query, {
          identity,
          lastChanged: request.lastChanged,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          operation: request.operation,
          version: request.version,
        });
        const included = await answerIncluded(
          ctx,
          installed,
          identity,
          response.include ?? [],
        );
        return {
          ...(included.length > 0 ? { included } : {}),
          routes: response.routes ?? [],
          value: response.value,
        };
      },
    }),
  } as const;
}

/**
 * Logs which operation a request is for, with its arguments' shape: each
 * argument's name, and an array's length, but no values.
 */
function logOperation(
  kind: "mutation" | "query",
  request: { readonly operation: unknown; readonly plugin: string },
) {
  const { operation, plugin } = request;
  const type: unknown = Reflect.get(Object(operation), "type");
  const args: unknown = Reflect.get(Object(operation), "args");
  const shape = Object.fromEntries(
    Object.entries(typeof args === "object" && args !== null ? args : {}).map(
      ([name, value]: [string, unknown]) => [
        name,
        Array.isArray(value) ? value.length : typeof value,
      ],
    ),
  );
  console.log("pds", kind, plugin, String(type), JSON.stringify(shape));
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

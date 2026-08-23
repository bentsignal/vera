import type { DecentralizedConvexVersion } from "@decentralized-convex/core";
import type { Infer, Validator } from "convex/values";
import { DECENTRALIZED_CONVEX_VERSION } from "@decentralized-convex/core";
import { v } from "convex/values";

export interface Operation<
  Args extends Validator<Record<string, unknown>, "required", string>,
  Result extends Validator<unknown, "required", string>,
> {
  readonly args: Args;
  readonly returns: Result;
}

export type AnyOperation = Operation<
  Validator<Record<string, unknown>, "required", string>,
  Validator<unknown, "required", string>
>;

export type OperationMap = Readonly<Record<string, AnyOperation>>;

export type PluginRequirements = Readonly<Record<string, string>>;

export interface PluginProtocol<
  Name extends string,
  Version extends string,
  Queries extends OperationMap,
  Mutations extends OperationMap,
  Requirements extends PluginRequirements,
> {
  readonly lastChanged: DecentralizedConvexVersion;
  readonly name: Name;
  readonly mutations: Mutations;
  readonly queries: Queries;
  readonly requires: Requirements;
  readonly version: Version;
}

export type AnyPluginProtocol = PluginProtocol<
  string,
  string,
  OperationMap,
  OperationMap,
  PluginRequirements
>;

export type ProtocolRequirements<Value extends AnyPluginProtocol> =
  Value["requires"];

export type OperationArgs<Value extends AnyOperation> = Infer<Value["args"]>;
export type OperationResult<Value extends AnyOperation> = Infer<
  Value["returns"]
>;

export type OperationRequest<Operations extends OperationMap> = {
  readonly [Name in keyof Operations & string]: {
    readonly args: OperationArgs<Operations[Name]>;
    readonly type: Name;
  };
}[keyof Operations & string];

export type OperationReturn<
  Operations extends OperationMap,
  Request extends OperationRequest<Operations>,
> = Request extends { readonly type: infer Name extends keyof Operations }
  ? OperationResult<Operations[Name]>
  : never;

export type OperationResponse<Operations extends OperationMap> = {
  readonly [Name in keyof Operations & string]: {
    readonly routes?: readonly string[];
    readonly type: Name;
    readonly value: OperationResult<Operations[Name]>;
  };
}[keyof Operations & string];

export function defineOperation<
  const Args extends Validator<Record<string, unknown>, "required", string>,
  const Result extends Validator<unknown, "required", string>,
>(definition: Operation<Args, Result>): Operation<Args, Result> {
  return Object.freeze(definition);
}

export function definePluginProtocol<
  const Name extends string,
  const Queries extends OperationMap,
  const Mutations extends OperationMap,
  const Requirements extends PluginRequirements,
>(
  protocol: Omit<
    PluginProtocol<
      Name,
      typeof DECENTRALIZED_CONVEX_VERSION,
      Queries,
      Mutations,
      Requirements
    >,
    "version"
  >,
): PluginProtocol<
  Name,
  typeof DECENTRALIZED_CONVEX_VERSION,
  Queries,
  Mutations,
  Requirements
> {
  const versioned = {
    ...protocol,
    version: DECENTRALIZED_CONVEX_VERSION,
  };
  assertOperations(versioned.name, "query", versioned.queries);
  assertOperations(versioned.name, "mutation", versioned.mutations);
  assertDistinctOperationNames(versioned);
  if (Object.hasOwn(protocol.requires, protocol.name)) {
    throw new Error(`Plugin ${protocol.name} cannot require itself.`);
  }
  return Object.freeze(versioned);
}

export function operationValidator<const Operations extends OperationMap>(
  operations: Operations,
): Validator<OperationRequest<Operations>, "required", string> {
  const members = Object.entries(operations).map(([type, operation]) =>
    v.object({ args: operation.args, type: v.literal(type) }),
  );
  if (members.length === 0) {
    throw new Error("A dispatcher must define at least one operation.");
  }

  // Object.entries necessarily erases the literal operation names. The returned validator is
  // reconstructed from those same definitions, making this the trusted runtime/type bridge.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return v.union(...members) as Validator<
    OperationRequest<Operations>,
    "required",
    string
  >;
}

export function operationResponseValidator<
  const Operations extends OperationMap,
>(
  operations: Operations,
): Validator<OperationResponse<Operations>, "required", string> {
  const members = Object.entries(operations).map(([type, operation]) =>
    v.object({
      routes: v.optional(v.array(v.string())),
      type: v.literal(type),
      value: operation.returns,
    }),
  );
  if (members.length === 0) {
    throw new Error("A dispatcher must define at least one operation.");
  }

  // Object.entries erases the literal operation names; the union is built from those exact names.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return v.union(...members) as Validator<
    OperationResponse<Operations>,
    "required",
    string
  >;
}

function assertDistinctOperationNames(protocol: AnyPluginProtocol) {
  const reserved = ["mutations", "queries"];
  for (const name of reserved) {
    if (
      Object.hasOwn(protocol.queries, name) ||
      Object.hasOwn(protocol.mutations, name)
    ) {
      throw new Error(
        `Plugin ${protocol.name} cannot use reserved operation name ${name}.`,
      );
    }
  }

  for (const name of Object.keys(protocol.queries)) {
    if (Object.hasOwn(protocol.mutations, name)) {
      throw new Error(
        `Plugin ${protocol.name} cannot define ${name} as both a query and mutation.`,
      );
    }
  }
}

function assertOperations(
  pluginName: string,
  kind: "mutation" | "query",
  operations: OperationMap,
) {
  if (Object.keys(operations).length === 0) {
    throw new Error(`Plugin ${pluginName} must define at least one ${kind}.`);
  }
}

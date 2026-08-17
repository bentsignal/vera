import type {
  AnyPluginProtocol,
  OperationArgs,
  OperationMap,
  OperationResult,
} from "@decentralized-convex/plugin";
import {
  DECENTRALIZED_CONVEX_LAST_CHANGED,
  DECENTRALIZED_CONVEX_VERSION,
} from "@decentralized-convex/core";

import type {
  FederationTarget,
  FederationTargetGroup,
  SuccessfulFederationSource,
} from "./types.ts";

declare const PdsResultType: unique symbol;

export interface PdsApiRequirement {
  readonly id: string;
  readonly lastChanged: string;
}

export interface PdsApiRequirements {
  readonly capabilities: readonly PdsApiRequirement[];
  readonly lastChanged: string;
  readonly version: string;
}

const requirementsByApi = new WeakMap<object, PdsApiRequirements>();

export interface SerializedPdsRequest {
  readonly [key: string]: unknown;
  readonly lastChanged: string;
  readonly operation: {
    readonly args: Record<string, unknown>;
    readonly type: string;
  };
  readonly plugin: string;
  readonly version: string;
}

export interface PdsRequest<
  Result,
  Kind extends "mutation" | "query",
> extends SerializedPdsRequest {
  readonly [PdsResultType]?: {
    readonly kind: Kind;
    readonly result: Result;
  };
}

export type AnyPdsQueryRequest = PdsRequest<unknown, "query">;
export type AnyPdsMutationRequest = PdsRequest<unknown, "mutation">;

export type PdsRequestResult<Request> =
  Request extends PdsRequest<infer Result, "mutation" | "query">
    ? Result
    : never;

export type DefaultCombinedPdsResult<Request extends AnyPdsQueryRequest> =
  PdsRequestResult<Request> extends readonly (infer Item)[]
    ? Item[]
    : PdsRequestResult<Request>[];

export interface FederatedPdsQueryOptions<
  Request extends AnyPdsQueryRequest,
  Combined = DefaultCombinedPdsResult<Request>,
> {
  combine?: (
    sources: readonly SuccessfulFederationSource<PdsRequestResult<Request>>[],
  ) => Combined;
  request: Request | ((target: FederationTargetGroup) => Request);
  targets: readonly FederationTarget[];
}

type OperationRequestBuilders<
  PluginName extends string,
  PluginVersion extends string,
  PluginLastChanged extends string,
  Operations extends OperationMap,
  Kind extends "mutation" | "query",
> = {
  readonly [Name in keyof Operations]: (
    args: OperationArgs<Operations[Name]>,
  ) => PdsRequest<OperationResult<Operations[Name]>, Kind> & {
    readonly operation: {
      readonly args: OperationArgs<Operations[Name]>;
      readonly type: Name;
    };
    readonly lastChanged: PluginLastChanged;
    readonly plugin: PluginName;
    readonly version: PluginVersion;
  };
};

export type PdsPluginApi<Protocol extends AnyPluginProtocol> = {
  readonly mutations: OperationRequestBuilders<
    Protocol["name"],
    Protocol["version"],
    Protocol["lastChanged"],
    Protocol["mutations"],
    "mutation"
  >;
  readonly queries: OperationRequestBuilders<
    Protocol["name"],
    Protocol["version"],
    Protocol["lastChanged"],
    Protocol["queries"],
    "query"
  >;
} & OperationRequestBuilders<
  Protocol["name"],
  Protocol["version"],
  Protocol["lastChanged"],
  Protocol["queries"],
  "query"
> &
  OperationRequestBuilders<
    Protocol["name"],
    Protocol["version"],
    Protocol["lastChanged"],
    Protocol["mutations"],
    "mutation"
  >;

export type PdsApi<
  Protocols extends Readonly<Record<string, AnyPluginProtocol>>,
> = {
  readonly [Name in keyof Protocols]: PdsPluginApi<Protocols[Name]>;
};

type ProtocolsByName<Protocols extends readonly AnyPluginProtocol[]> = {
  readonly [Protocol in Protocols[number] as Protocol["name"]]: Protocol;
};

export function definePdsApi<
  const Protocols extends readonly AnyPluginProtocol[],
>(...protocols: Protocols): PdsApi<ProtocolsByName<Protocols>> {
  const api = Object.fromEntries(
    protocols.map((protocol) => {
      const mutations = defineRequestBuilders(
        protocol.lastChanged,
        protocol.name,
        protocol.version,
        protocol.mutations,
      );
      const queries = defineRequestBuilders(
        protocol.lastChanged,
        protocol.name,
        protocol.version,
        protocol.queries,
      );
      return [protocol.name, { ...queries, ...mutations, mutations, queries }];
    }),
  );
  requirementsByApi.set(api, {
    capabilities: protocols.map(({ lastChanged, name }) => ({
      id: name,
      lastChanged,
    })),
    lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.protocol,
    version: DECENTRALIZED_CONVEX_VERSION,
  });

  // The runtime object is constructed from the exact protocol map supplied by the caller.
  const erased: unknown = api;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return erased as PdsApi<ProtocolsByName<Protocols>>;
}

export function pdsApiRequirements(api: object): PdsApiRequirements {
  const requirements = requirementsByApi.get(api);
  if (requirements === undefined) {
    throw new Error("PDS API requirements are unavailable");
  }
  return requirements;
}

function defineRequestBuilders(
  lastChanged: string,
  plugin: string,
  version: string,
  operations: OperationMap,
): Readonly<
  Record<string, (args: Record<string, unknown>) => SerializedPdsRequest>
> {
  return Object.freeze(
    Object.fromEntries(
      Object.keys(operations).map((type) => [
        type,
        (args: Record<string, unknown>) => ({
          lastChanged,
          operation: { args, type },
          plugin,
          version,
        }),
      ]),
    ),
  );
}

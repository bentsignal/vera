import type { QueryRequest } from "@decentralized-convex/plugin";
import type { FunctionReference } from "convex/server";
import type { Value } from "convex/values";

import type { DispatcherIdentity } from "./dispatcher.ts";

interface ComponentDispatcherRequest {
  readonly [key: string]: Value;
  readonly identity: DispatcherIdentity | null;
  readonly lastChanged: string;
  // Component operation unions differ by plugin and are erased only inside the trusted router.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly operation: any;
  readonly version: string;
}

interface DispatcherResponse {
  readonly answered?: readonly {
    readonly request: QueryRequest;
    readonly routes?: readonly string[];
    readonly value: Value;
  }[];
  readonly include?: readonly QueryRequest[];
  readonly routes?: readonly string[];
  readonly type: string;
  readonly value: Value;
}

type ComponentQuery = FunctionReference<
  "query",
  "internal" | "public",
  ComponentDispatcherRequest,
  DispatcherResponse
>;

type ComponentQueries = FunctionReference<
  "query",
  "internal" | "public",
  {
    readonly identity: DispatcherIdentity | null;
    readonly requests: readonly QueryRequest[];
  },
  readonly (DispatcherResponse | null)[]
>;

type ComponentMutation = FunctionReference<
  "mutation",
  "internal" | "public",
  ComponentDispatcherRequest,
  DispatcherResponse
>;

interface DispatcherComponent {
  readonly dispatcher: {
    readonly dispatchMutation: ComponentMutation;
    readonly dispatchQuery: ComponentQuery;
    /** Absent from plugins that predate included queries. */
    readonly dispatchQueries?: ComponentQueries;
  };
}

export type DispatcherComponents = Readonly<
  Record<string, DispatcherComponent>
>;

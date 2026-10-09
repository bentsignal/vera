import type {
  FederationConnection,
  FederationMutationReference,
  FederationQueryReference,
  PdsConnectionMutationOptions,
  PdsRequest,
} from "@decentralized-convex/client";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { DecentralizedConvexClient } from "@decentralized-convex/client";
import { DECENTRALIZED_CONVEX_VERSION } from "@decentralized-convex/core";
import { decentralizedConvexPackage as corePackage } from "@decentralized-convex/core/metadata";

// In-memory PDSs for tests. a.test routes queries to itself and b.test.

export interface Note {
  body: string;
  id: string;
}

export function listNotes(args: {
  owner: string;
}): PdsRequest<readonly Note[], "query"> {
  return {
    lastChanged: corePackage.lastChanged,
    operation: { args, type: "list" },
    plugin: "notes",
    version: DECENTRALIZED_CONVEX_VERSION,
  };
}

export function createNote(args: {
  body: string;
}): PdsRequest<Note, "mutation"> {
  return {
    lastChanged: corePackage.lastChanged,
    operation: { args, type: "create" },
    plugin: "notes",
    version: DECENTRALIZED_CONVEX_VERSION,
  };
}

export function memoryTransport(home: string) {
  const connections = new Map<string, MemoryConnection>();
  const transport = new DecentralizedConvexClient({
    connectionFactory: (url) => {
      const connection = new MemoryConnection(url);
      connections.set(url, connection);
      return connection;
    },
    pds: {
      discover: (domain) => Promise.resolve(discoveredPds(domain)),
      home: discoveredPds(home),
    },
  });
  return { connections, transport };
}

export class MemoryConnection implements FederationConnection {
  readonly #publishers = new Set<(body: string) => void>();
  readonly #url;
  /** The last mutation's optimistic update, for tests to apply. */
  optimisticUpdate: PdsConnectionMutationOptions["optimisticUpdate"];

  constructor(url: string) {
    this.#url = url;
  }

  close() {
    return Promise.resolve();
  }

  mutation<Mutation extends FederationMutationReference>(
    _mutation: Mutation,
    args: FunctionArgs<Mutation>,
    options?: PdsConnectionMutationOptions,
  ): Promise<FunctionReturnType<Mutation>> {
    this.optimisticUpdate = options?.optimisticUpdate;
    const body = operationArgs(args).body;
    const result = { body, id: this.#url };
    // The fake connection cannot derive a concrete result from an arbitrary reference.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return Promise.resolve(result) as Promise<FunctionReturnType<Mutation>>;
  }

  query<Query extends FederationQueryReference>(
    _query: Query,
    args: FunctionArgs<Query>,
  ): Promise<FunctionReturnType<Query>> {
    const owner = operationArgs(args).owner;
    const result = {
      routes: this.#url === "https://a.test" ? ["a.test", "b.test"] : [],
      value: [{ body: this.#url, id: owner }],
    };
    // The fake connection cannot derive a concrete result from an arbitrary reference.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return Promise.resolve(result) as Promise<FunctionReturnType<Query>>;
  }

  subscribe<Query extends FederationQueryReference>(
    query: Query,
    args: FunctionArgs<Query>,
    onResult: (result: FunctionReturnType<Query>) => void,
  ) {
    const routes = this.#url === "https://a.test" ? ["a.test", "b.test"] : [];
    function publish(body: string) {
      const owner = operationArgs(args).owner;
      const result = {
        routes,
        value: [{ body, id: owner }],
      };
      // The fake connection cannot derive a concrete result from an arbitrary reference.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      onResult(result as FunctionReturnType<Query>);
    }
    this.#publishers.add(publish);
    publish(this.#url);
    return () => this.#publishers.delete(publish);
  }

  emit(body: string) {
    for (const publish of this.#publishers) publish(body);
  }
}

export function discoveredPds(domain: string) {
  return {
    domain,
    manifest: {
      accountDomain: domain,
      capabilities: [
        {
          id: "notes",
          lastChanged: corePackage.lastChanged,
        },
      ],
      deploymentUrl: `https://${domain}`,
      httpUrl: `https://${domain}`,
      lastChanged: "0.1.0",
      version: "0.1.0",
    },
    manifestUrl: `https://${domain}/.well-known/pds.json`,
  };
}

export function nextTask() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export function operationArgs(value: unknown): Record<string, string> {
  if (
    typeof value === "object" &&
    value !== null &&
    "operation" in value &&
    typeof value.operation === "object" &&
    value.operation !== null &&
    "args" in value.operation &&
    typeof value.operation.args === "object" &&
    value.operation.args !== null
  ) {
    // The test builders above only create string-valued argument records.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return value.operation.args as Record<string, string>;
  }
  throw new Error("Expected a PDS operation request");
}

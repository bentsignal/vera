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
// Asked for the owner "with-included", a.test also answers the owner
// "included"'s list (see `include` on the PDS).

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

/**
 * `answerAfter` delays each subscription's first answer by that many
 * milliseconds, like a real connection; otherwise it answers at once.
 * `queryAfter` does the same for one-shot queries.
 */
export function memoryTransport(
  home: string,
  {
    answerAfter,
    queryAfter,
  }: { answerAfter?: number; queryAfter?: number } = {},
) {
  const connections = new Map<string, MemoryConnection>();
  const transport = new DecentralizedConvexClient({
    connectionFactory: (url) => {
      const connection = new MemoryConnection(url, answerAfter, queryAfter);
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

function includedWith(url: string, owner: string | undefined) {
  if (url !== "https://a.test" || owner !== "with-included") return [];
  return [
    {
      request: listNotes({ owner: "included" }),
      routes: [],
      value: [{ body: "included", id: "included" }],
    },
  ];
}

export class MemoryConnection implements FederationConnection {
  readonly #answerAfter;
  readonly #publishers = new Set<(body: string) => void>();
  readonly #queryAfter;
  readonly #url;
  /** The arguments of every subscription, oldest first. */
  readonly subscribed: unknown[] = [];
  /** The last mutation's optimistic update, for tests to apply. */
  optimisticUpdate: PdsConnectionMutationOptions["optimisticUpdate"];

  constructor(url: string, answerAfter?: number, queryAfter?: number) {
    this.#answerAfter = answerAfter;
    this.#queryAfter = queryAfter;
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

  async query<Query extends FederationQueryReference>(
    _query: Query,
    args: FunctionArgs<Query>,
  ): Promise<FunctionReturnType<Query>> {
    if (this.#queryAfter !== undefined) await wait(this.#queryAfter);
    const owner = operationArgs(args).owner;
    const result = {
      included: includedWith(this.#url, owner),
      routes: this.#url === "https://a.test" ? ["a.test", "b.test"] : [],
      value: [{ body: this.#url, id: owner }],
    };
    // The fake connection cannot derive a concrete result from an arbitrary reference.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return result as FunctionReturnType<Query>;
  }

  subscribe<Query extends FederationQueryReference>(
    query: Query,
    args: FunctionArgs<Query>,
    onResult: (result: FunctionReturnType<Query>) => void,
  ) {
    const routes = this.#url === "https://a.test" ? ["a.test", "b.test"] : [];
    const url = this.#url;
    this.subscribed.push(args);
    const include = Reflect.get(Object(args), "include") !== false;
    function publish(body: string) {
      const owner = operationArgs(args).owner;
      const result = {
        included: include ? includedWith(url, owner) : [],
        routes,
        value: [{ body, id: owner }],
      };
      // The fake connection cannot derive a concrete result from an arbitrary reference.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      onResult(result as FunctionReturnType<Query>);
    }
    this.#publishers.add(publish);
    if (this.#answerAfter === undefined) {
      publish(this.#url);
      return () => this.#publishers.delete(publish);
    }
    const answer = setTimeout(() => publish(this.#url), this.#answerAfter);
    return () => {
      clearTimeout(answer);
      this.#publishers.delete(publish);
    };
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

export function wait(delay: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delay));
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

import assert from "node:assert/strict";
import test from "node:test";
import type {
  FederationConnection,
  FederationMutationReference,
  FederationQueryReference,
  PdsRequest,
} from "@decentralized-convex/client";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import {
  MutationObserver,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query";
import { DecentralizedConvexClient } from "@decentralized-convex/client";
import {
  DECENTRALIZED_CONVEX_LAST_CHANGED,
  DECENTRALIZED_CONVEX_VERSION,
} from "@decentralized-convex/core";

import { pdsMutation, pdsQuery, PdsQueryClient } from "./pds.ts";

interface Note {
  body: string;
  id: string;
}

function listNotes(args: {
  owner: string;
}): PdsRequest<readonly Note[], "query"> {
  return {
    lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.protocol,
    operation: { args, type: "list" },
    plugin: "notes",
    version: DECENTRALIZED_CONVEX_VERSION,
  };
}

function createNote(args: { body: string }): PdsRequest<Note, "mutation"> {
  return {
    lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.protocol,
    operation: { args, type: "create" },
    plugin: "notes",
    version: DECENTRALIZED_CONVEX_VERSION,
  };
}

void test("produces native TanStack query and mutation options", async () => {
  const connections = new Map<string, MemoryConnection>();
  const transport = new DecentralizedConvexClient({
    connectionFactory: (url) => {
      const connection = new MemoryConnection(url);
      connections.set(url, connection);
      return connection;
    },
    pds: {
      discover: (domain) => Promise.resolve(discoveredPds(domain)),
      home: discoveredPds("a.test"),
    },
  });
  const queryClient = new QueryClient();
  const adapter = new PdsQueryClient(transport);
  const disconnect = adapter.connect(queryClient);

  const query = pdsQuery(listNotes, { owner: "alice" });
  assert.deepEqual(await queryClient.fetchQuery(query), [
    { body: "https://a.test", id: "alice" },
    { body: "https://b.test", id: "alice" },
  ]);

  const observer = new QueryObserver(queryClient, query);
  const unsubscribe = observer.subscribe(() => undefined);
  await nextTask();
  connections.get("https://a.test")?.emit("updated");
  await nextTask();
  assert.deepEqual(queryClient.getQueryData(query.queryKey), [
    { body: "updated", id: "alice" },
    { body: "https://b.test", id: "alice" },
  ]);

  const mutation = new MutationObserver(queryClient, pdsMutation(createNote));
  assert.deepEqual(await mutation.mutate({ body: "hello" }), {
    body: "hello",
    id: "https://a.test",
  });

  unsubscribe();
  disconnect();
  await transport.close();
});

class MemoryConnection implements FederationConnection {
  readonly #publishers = new Set<(body: string) => void>();
  readonly #url;

  constructor(url: string) {
    this.#url = url;
  }

  close() {
    return Promise.resolve();
  }

  mutation<Mutation extends FederationMutationReference>(
    _mutation: Mutation,
    args: FunctionArgs<Mutation>,
  ): Promise<FunctionReturnType<Mutation>> {
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

function discoveredPds(domain: string) {
  return {
    domain,
    manifest: {
      accountDomain: domain,
      capabilities: [
        {
          id: "notes",
          lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.protocol,
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

function nextTask() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function operationArgs(value: unknown): Record<string, string> {
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

import assert from "node:assert/strict";
import test from "node:test";
import type {
  FederationConnection,
  FederationMutationReference,
  FederationQueryReference,
  PdsQueryData,
  PdsRequest,
} from "@decentralized-convex/client";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import {
  MutationObserver,
  QueryClient,
  QueryObserver,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { DecentralizedConvexClient } from "@decentralized-convex/client";
import { DECENTRALIZED_CONVEX_VERSION } from "@decentralized-convex/core";
import { decentralizedConvexPackage as corePackage } from "@decentralized-convex/core/metadata";

import { PdsQueryClient } from "./pds-query-client.ts";
import { pdsMutation, pdsQuery } from "./pds.ts";

interface Note {
  body: string;
  id: string;
}

function listNotes(args: {
  owner: string;
}): PdsRequest<readonly Note[], "query"> {
  return {
    lastChanged: corePackage.lastChanged,
    operation: { args, type: "list" },
    plugin: "notes",
    version: DECENTRALIZED_CONVEX_VERSION,
  };
}

function createNote(args: { body: string }): PdsRequest<Note, "mutation"> {
  return {
    lastChanged: corePackage.lastChanged,
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

  const query = pdsQuery({
    args: { owner: "alice" },
    options: { revealPartialResultsAfter: 0 },
    query: listNotes,
  });
  assert.equal("revealPartialResultsAfter" in query, false);
  const initialObserver = new QueryObserver(new QueryClient(), query);
  assert.deepEqual(initialObserver.getCurrentResult().data, {
    federation: { sources: [], status: "pending" },
    status: "loading",
  });

  const initial = await queryClient.fetchQuery(query);
  assert.equal(initial.status, "success");
  assert.deepEqual(initial.result, [
    { body: "https://a.test", id: "alice" },
    { body: "https://b.test", id: "alice" },
  ]);
  assert.equal(initial.federation.status, "success");
  assert.deepEqual(
    initial.federation.sources.map((source) => source.status),
    ["live", "live"],
  );

  const observer = new QueryObserver(queryClient, query);
  const unsubscribe = observer.subscribe(() => undefined);
  await nextTask();
  connections.get("https://a.test")?.emit("updated");
  await nextTask();
  const updated = queryClient.getQueryData<
    PdsQueryData<Note[], readonly Note[]>
  >(query.queryKey);
  assert.ok(updated);
  assert.equal(updated.status, "success");
  assert.deepEqual(updated.result, [
    { body: "updated", id: "alice" },
    { body: "https://b.test", id: "alice" },
  ]);
  assert.equal(updated.federation.status, "success");

  const mutation = new MutationObserver(
    queryClient,
    pdsMutation({ mutation: createNote }),
  );
  assert.deepEqual(await mutation.mutate({ body: "hello" }), {
    body: "hello",
    id: "https://a.test",
  });

  unsubscribe();
  disconnect();
  await transport.close();
});

void test("strict queries resolve only with complete initial data", async () => {
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const adapter = new PdsQueryClient(transport);
  const disconnect = adapter.connect(queryClient);
  const query = pdsQuery({
    args: { owner: "alice" },
    options: { requireCompleteResults: true },
    query: listNotes,
  });

  assert.equal("initialData" in query, false);
  const result = await queryClient.ensureQueryData(query);
  assert.equal(result.status, "success");
  assert.deepEqual(result.result, [
    { body: "https://a.test", id: "alice" },
    { body: "https://b.test", id: "alice" },
  ]);

  const observer = new QueryObserver(queryClient, query);
  const unsubscribe = observer.subscribe(() => undefined);
  assert.equal(observer.getCurrentResult().data?.status, "success");
  await nextTask();
  connections.get("https://a.test")?.emit("Hydrated live update");
  await nextTask();
  const updated = observer.getCurrentResult().data;
  assert.ok(updated);
  assert.equal(updated.status, "success");
  assert.deepEqual(updated.result, [
    { body: "Hydrated live update", id: "alice" },
    { body: "https://b.test", id: "alice" },
  ]);

  unsubscribe();
  disconnect();
  await transport.close();
});

function usePdsQueryTypeTest() {
  const query = useQuery(
    pdsQuery({
      args: { owner: "alice" },
      options: { enabled: true },
      query: listNotes,
    }),
  );
  const data: PdsQueryData<Note[], readonly Note[]> = query.data;
  const source = query.data.federation.sources[0];
  if (source?.status === "live") {
    const notes: readonly Note[] = source.data;
    void notes;
  }
  return data;
}

void usePdsQueryTypeTest;

function useCompletePdsQueryTypeTest() {
  const query = useSuspenseQuery(
    pdsQuery({
      args: { owner: "alice" },
      options: { requireCompleteResults: true },
      query: listNotes,
    }),
  );
  const status: "success" = query.data.status;
  const notes: Note[] = query.data.result;
  return { notes, status };
}

void useCompletePdsQueryTypeTest;

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

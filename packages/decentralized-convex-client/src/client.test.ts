import assert from "node:assert/strict";
import test from "node:test";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { DECENTRALIZED_CONVEX_VERSION } from "@decentralized-convex/core";
import { decentralizedConvexPackage as corePackage } from "@decentralized-convex/core/metadata";
import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import type { PdsRequest } from "./pds.ts";
import type {
  FederationConnection,
  FederationMutationReference,
  FederationQueryReference,
} from "./types.ts";
import { DecentralizedConvexClient } from "./client.ts";
import { definePdsApi } from "./pds.ts";

const listItems = makeFunctionReference<
  "query",
  { scope: string },
  readonly { id: string; value: string }[]
>("items:list");

void test("groups identities by deployment and combines native query results", async () => {
  const connections = new Map<string, MemoryConnection>();
  const client = new DecentralizedConvexClient({
    connectionFactory: (url) => {
      const connection = new MemoryConnection(url);
      connections.set(url, connection);
      return connection;
    },
  });

  const snapshot = await client.query({
    args: ({ ids }) => ({ scope: ids.join(",") }),
    combine: (sources) => sources.flatMap((source) => source.data),
    query: listItems,
    targets: [
      { id: "alice@shared.test", url: "https://shared.test" },
      { id: "bob@shared.test", url: "https://shared.test/" },
      { id: "carol@solo.test", url: "https://solo.test" },
    ],
  });

  assert.equal(connections.size, 2);
  assert.equal(snapshot.status, "success");
  assert.deepEqual(
    snapshot.data.map((item) => item.value),
    ["alice@shared.test,bob@shared.test", "carol@solo.test"],
  );
  await client.close();
});

void test("federates typed PDS requests without a generated backend API", async () => {
  const notes = definePluginProtocol({
    lastChanged: corePackage.lastChanged,
    name: "notes",
    mutations: {
      create: defineOperation({
        args: v.object({ body: v.string() }),
        returns: v.object({ id: v.string() }),
      }),
    },
    queries: {
      list: defineOperation({
        args: v.object({}),
        returns: v.array(v.object({ body: v.string() })),
      }),
    },
    requires: {},
  });
  const api = definePdsApi(notes);
  const client = new DecentralizedConvexClient({
    connectionFactory: (url) => new MemoryConnection(url),
  });

  const snapshot = await client.federatedPdsQuery({
    request: api.notes.queries.list({}),
    targets: [
      { id: "alice@a.test", url: "https://a.test" },
      { id: "bob@b.test", url: "https://b.test" },
    ],
  });

  assert.equal(snapshot.status, "success");
  assert.deepEqual(snapshot.data, [
    { body: "https://a.test" },
    { body: "https://b.test" },
  ]);
  await client.close();
});

void test("reveals initial partial PDS data after the grace period and retains stale data", async () => {
  const connections = new Map<string, ControlledConnection>();
  const client = new DecentralizedConvexClient({
    connectionFactory: (url) => {
      const connection = new ControlledConnection();
      connections.set(url, connection);
      return connection;
    },
    pds: {
      discover: (domain) => Promise.resolve(discoveredPds(domain)),
      home: discoveredPds("a.test"),
    },
  });
  const observer = client.watchPdsQuery(listNotesRequest, {
    revealPartialResultsAfter: 20,
  });
  const unsubscribe = observer.subscribe(() => undefined);

  connections.get("https://a.test")?.emit([{ body: "a" }], ["b.test"]);
  await nextTask();
  assert.equal(observer.getSnapshot().status, "pending");

  await wait(25);
  assert.equal(observer.getSnapshot().status, "partial");
  assert.deepEqual(observer.getSnapshot().data, [{ body: "a" }]);

  connections.get("https://b.test")?.emit([{ body: "b" }]);
  assert.equal(observer.getSnapshot().status, "success");
  assert.deepEqual(observer.getSnapshot().data, [{ body: "a" }, { body: "b" }]);

  connections.get("https://b.test")?.fail(new Error("temporarily offline"));
  assert.equal(observer.getSnapshot().status, "success");
  assert.deepEqual(observer.getSnapshot().data, [{ body: "a" }, { body: "b" }]);
  assert.equal(
    observer
      .getSnapshot()
      .sources.find((source) => source.target.url === "https://b.test")?.status,
    "stale",
  );

  connections
    .get("https://a.test")
    ?.emit([{ body: "a2" }], ["b.test", "c.test"]);
  await nextTask();
  assert.equal(observer.getSnapshot().status, "success");
  assert.deepEqual(observer.getSnapshot().data, [
    { body: "a2" },
    { body: "b" },
  ]);
  assert.equal(
    observer
      .getSnapshot()
      .sources.find((source) => source.target.url === "https://c.test")?.status,
    "pending",
  );

  unsubscribe();
  observer.close();
  await client.close();
});

void test("returns complete PDS data immediately during the partial grace period", async () => {
  const connections = new Map<string, ControlledConnection>();
  const client = new DecentralizedConvexClient({
    connectionFactory: (url) => {
      const connection = new ControlledConnection();
      connections.set(url, connection);
      return connection;
    },
    pds: {
      discover: (domain) => Promise.resolve(discoveredPds(domain)),
      home: discoveredPds("a.test"),
    },
  });
  const observer = client.watchPdsQuery(listNotesRequest, {
    revealPartialResultsAfter: 60_000,
  });

  connections.get("https://a.test")?.emit([{ body: "a" }], ["b.test"]);
  await nextTask();
  assert.equal(observer.getSnapshot().status, "pending");
  connections.get("https://b.test")?.emit([{ body: "b" }]);
  assert.equal(observer.getSnapshot().status, "success");

  observer.close();
  await client.close();
});

const listNotesRequest = {
  lastChanged: corePackage.lastChanged,
  operation: { args: {}, type: "list" },
  plugin: "notes",
  version: DECENTRALIZED_CONVEX_VERSION,
} satisfies PdsRequest<readonly { body: string }[], "query">;

class MemoryConnection implements FederationConnection {
  readonly #url;

  constructor(url: string) {
    this.#url = url;
  }

  close() {
    return Promise.resolve();
  }

  mutation<Mutation extends FederationMutationReference>(): Promise<
    FunctionReturnType<Mutation>
  > {
    return Promise.reject(new Error("Not implemented"));
  }

  query<Query extends FederationQueryReference>(
    _query: Query,
    args: FunctionArgs<Query>,
  ): Promise<FunctionReturnType<Query>> {
    const result = isPdsRequest(args)
      ? { routes: [], value: [{ body: this.#url }] }
      : [{ id: this.#url, value: getScope(args) }];
    // The fake connection cannot derive a concrete return type from an arbitrary test reference.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return Promise.resolve(result) as Promise<FunctionReturnType<Query>>;
  }

  subscribe<Query extends FederationQueryReference>(
    query: Query,
    args: FunctionArgs<Query>,
    onResult: (result: FunctionReturnType<Query>) => void,
  ) {
    void this.query(query, args).then(onResult);
    return () => undefined;
  }
}

class ControlledConnection implements FederationConnection {
  #fail?: (error: Error) => void;
  #publish?: (
    value: readonly { body: string }[],
    routes: readonly string[],
  ) => void;

  close() {
    return Promise.resolve();
  }

  mutation<Mutation extends FederationMutationReference>(): Promise<
    FunctionReturnType<Mutation>
  > {
    return Promise.reject(new Error("Not implemented"));
  }

  query<Query extends FederationQueryReference>(): Promise<
    FunctionReturnType<Query>
  > {
    return Promise.reject(new Error("Not implemented"));
  }

  subscribe<Query extends FederationQueryReference>(
    _query: Query,
    _args: FunctionArgs<Query>,
    onResult: (result: FunctionReturnType<Query>) => void,
    onError: (error: Error) => void,
  ) {
    this.#publish = (value, routes) => {
      const result = { routes, value };
      // The controlled connection only receives the PDS root query in this test.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      onResult(result as FunctionReturnType<Query>);
    };
    this.#fail = onError;
    return () => {
      this.#publish = undefined;
      this.#fail = undefined;
    };
  }

  emit(value: readonly { body: string }[], routes: readonly string[] = []) {
    this.#publish?.(value, routes);
  }

  fail(error: Error) {
    this.#fail?.(error);
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
      lastChanged: corePackage.lastChanged,
      version: DECENTRALIZED_CONVEX_VERSION,
    },
    manifestUrl: `https://${domain}/.well-known/pds.json`,
  };
}

function nextTask() {
  return wait(0);
}

function wait(delay: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delay));
}

function isPdsRequest(args: unknown) {
  return (
    typeof args === "object" &&
    args !== null &&
    "plugin" in args &&
    typeof args.plugin === "string"
  );
}

function getScope(args: unknown) {
  if (
    typeof args === "object" &&
    args !== null &&
    "scope" in args &&
    typeof args.scope === "string"
  ) {
    return args.scope;
  }
  throw new Error("Expected a scope argument");
}

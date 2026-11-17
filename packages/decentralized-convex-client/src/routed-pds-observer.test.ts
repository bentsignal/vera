import assert from "node:assert/strict";
import test from "node:test";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { DECENTRALIZED_CONVEX_VERSION } from "@decentralized-convex/core";
import { decentralizedConvexPackage as corePackage } from "@decentralized-convex/core/metadata";

import type { PdsRequest } from "./pds.ts";
import type {
  FederationConnection,
  FederationMutationReference,
  FederationQueryReference,
} from "./types.ts";
import { DecentralizedConvexClient } from "./client.ts";

void test("times out an initial live source and recovers when it later responds", async () => {
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
    initialResponseTimeout: 20,
    revealPartialResultsAfter: 0,
  });

  connections.get("https://a.test")?.emit([{ body: "a" }], ["b.test"]);
  await wait(0);
  await wait(25);
  assert.equal(observer.getSnapshot().status, "partial");
  assert.equal(
    observer
      .getSnapshot()
      .sources.find((source) => source.target.url === "https://b.test")?.status,
    "error",
  );

  connections.get("https://b.test")?.emit([{ body: "b" }]);
  assert.equal(observer.getSnapshot().status, "success");
  assert.deepEqual(observer.getSnapshot().data, [{ body: "a" }, { body: "b" }]);

  observer.close();
  await client.close();
});

void test("passes on included results the home PDS answers completely", async () => {
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
  const observer = client.watchPdsQuery(listNotesRequest);
  const local = {
    ...listNotesRequest,
    operation: { args: { id: "1" }, type: "get" },
  };
  const remote = {
    ...listNotesRequest,
    operation: { args: { id: "2" }, type: "get" },
  };

  connections.get("https://a.test")?.emit(
    [{ body: "a" }],
    [],
    [
      { request: local, routes: ["someone@a.test"], value: { body: "one" } },
      { request: remote, routes: ["someone@b.test"], value: null },
    ],
  );
  await wait(0);

  const snapshot = observer.getSnapshot();
  assert.equal(snapshot.status, "success");
  assert.deepEqual(
    snapshot.included?.map(({ request, snapshot: included }) => [
      request,
      included.status,
      included.data,
    ]),
    [[local, "success", [{ body: "one" }]]],
  );

  observer.close();
  await client.close();
});

void test("publishes each update from home once while its routes stay the same", async () => {
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
  const observer = client.watchPdsQuery(listNotesRequest);
  const shown: unknown[] = [];
  observer.subscribe(() => shown.push(observer.getSnapshot().data));
  const home = connections.get("https://a.test");
  home?.emit([{ body: "a" }], []);
  await wait(0);
  const settled = shown.length;
  home?.emit([{ body: "a" }, { body: "b" }], []);
  await wait(0);
  home?.emit([{ body: "a" }, { body: "b" }, { body: "c" }], []);
  await wait(0);
  assert.equal(shown.length - settled, 2);
  assert.deepEqual(shown.at(-1), [{ body: "a" }, { body: "b" }, { body: "c" }]);

  observer.close();
  await client.close();
});

void test("answers from the PDSes it can find when a route's PDS is gone", async () => {
  const connections = new Map<string, ControlledConnection>();
  const lookups: string[] = [];
  const client = new DecentralizedConvexClient({
    connectionFactory: (url) => {
      const connection = new ControlledConnection();
      connections.set(url, connection);
      return connection;
    },
    pds: {
      discover: (address) => {
        const domain = address.slice(address.lastIndexOf("@") + 1);
        lookups.push(domain);
        return domain === "gone.test"
          ? Promise.reject(new Error("PDS manifest request failed (404)"))
          : Promise.resolve(discoveredPds(domain));
      },
      home: discoveredPds("a.test"),
    },
  });
  const observer = client.watchPdsQuery(listNotesRequest, {
    revealPartialResultsAfter: 0,
  });

  const home = connections.get("https://a.test");
  home?.emit([{ body: "a" }], ["someone@gone.test", "someone@b.test"]);
  await wait(0);
  connections.get("https://b.test")?.emit([{ body: "b" }]);
  await wait(0);

  const snapshot = observer.getSnapshot();
  assert.equal(snapshot.status, "partial");
  assert.deepEqual(snapshot.data, [{ body: "a" }, { body: "b" }]);
  const gone = snapshot.sources.find(
    (source) => source.target.url === "https://gone.test",
  );
  assert.equal(gone?.status, "error");

  // Another update from home doesn't look the gone domain up again.
  home?.emit([{ body: "a2" }], ["someone@gone.test", "someone@b.test"]);
  await wait(0);
  assert.deepEqual(observer.getSnapshot().data, [
    { body: "a2" },
    { body: "b" },
  ]);
  assert.equal(lookups.filter((domain) => domain === "gone.test").length, 1);

  observer.close();
  await client.close();
});

const listNotesRequest = {
  lastChanged: corePackage.lastChanged,
  operation: { args: {}, type: "list" },
  plugin: "notes",
  version: DECENTRALIZED_CONVEX_VERSION,
} satisfies PdsRequest<readonly { body: string }[], "query">;

class ControlledConnection implements FederationConnection {
  #publish?: (
    value: readonly { body: string }[],
    routes: readonly string[],
    included: readonly unknown[],
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
  ) {
    this.#publish = (value, routes, included) => {
      const result = { included, routes, value };
      // The controlled connection only receives the PDS root query in this test.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      onResult(result as FunctionReturnType<Query>);
    };
    return () => {
      this.#publish = undefined;
    };
  }

  emit(
    value: readonly { body: string }[],
    routes: readonly string[] = [],
    included: readonly unknown[] = [],
  ) {
    this.#publish?.(value, routes, included);
  }
}

function discoveredPds(domain: string) {
  return {
    domain,
    manifest: {
      accountDomain: domain,
      capabilities: [{ id: "notes", lastChanged: corePackage.lastChanged }],
      deploymentUrl: `https://${domain}`,
      httpUrl: `https://${domain}`,
      lastChanged: corePackage.lastChanged,
      version: DECENTRALIZED_CONVEX_VERSION,
    },
    manifestUrl: `https://${domain}/.well-known/pds.json`,
  };
}

function wait(delay: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delay));
}

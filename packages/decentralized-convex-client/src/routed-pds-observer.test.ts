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
    this.#publish = (value, routes) => {
      const result = { routes, value };
      // The controlled connection only receives the PDS root query in this test.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      onResult(result as FunctionReturnType<Query>);
    };
    return () => {
      this.#publish = undefined;
    };
  }

  emit(value: readonly { body: string }[], routes: readonly string[] = []) {
    this.#publish?.(value, routes);
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

import assert from "node:assert/strict";
import test from "node:test";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { DECENTRALIZED_CONVEX_LAST_CHANGED } from "@decentralized-convex/core";
import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

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
    lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.protocol,
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

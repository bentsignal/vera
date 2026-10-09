import assert from "node:assert/strict";
import test from "node:test";
import { DECENTRALIZED_CONVEX_VERSION } from "@decentralized-convex/core";
import { decentralizedConvexPackage as corePackage } from "@decentralized-convex/core/metadata";
import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { getFunctionName } from "convex/server";
import { v } from "convex/values";

import type { PdsConnection } from "./pds.ts";
import { definePdsApi, PdsClient, pdsFunctions } from "./pds.ts";

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
      args: v.object({ owner: v.string() }),
      returns: v.array(v.object({ body: v.string(), id: v.string() })),
    }),
  },
  requires: {},
});

void test("builds serializable PDS dispatcher requests", () => {
  const api = definePdsApi(notes);

  assert.deepEqual(api.notes.queries.list({ owner: "shawn" }), {
    lastChanged: corePackage.lastChanged,
    operation: { args: { owner: "shawn" }, type: "list" },
    plugin: "notes",
    version: DECENTRALIZED_CONVEX_VERSION,
  });
  assert.deepEqual(api.notes.mutations.create({ body: "hello" }), {
    lastChanged: corePackage.lastChanged,
    operation: { args: { body: "hello" }, type: "create" },
    plugin: "notes",
    version: DECENTRALIZED_CONVEX_VERSION,
  });
  assert.deepEqual(api.notes.list({ owner: "shawn" }), {
    lastChanged: corePackage.lastChanged,
    operation: { args: { owner: "shawn" }, type: "list" },
    plugin: "notes",
    version: DECENTRALIZED_CONVEX_VERSION,
  });
  assert.deepEqual(api.notes.create({ body: "hello" }), {
    lastChanged: corePackage.lastChanged,
    operation: { args: { body: "hello" }, type: "create" },
    plugin: "notes",
    version: DECENTRALIZED_CONVEX_VERSION,
  });
});

void test("binds protocols to canonical typed PDS calls", async () => {
  const calls: unknown[] = [];
  const connection: PdsConnection = {
    close: () => Promise.resolve(),
    mutation: (_mutation, args) => {
      calls.push(args);
      return Promise.resolve({ id: "note-1" });
    },
    query: (_query, args) => {
      calls.push(args);
      return Promise.resolve({
        routes: ["a.test", "b.test"],
        value: [{ body: "hello", id: "note-1" }],
      });
    },
    subscribe: (_query, args, onResult) => {
      calls.push(args);
      onResult({
        routes: ["a.test", "b.test"],
        value: [{ body: "live", id: "note-2" }],
      });
      return () => undefined;
    },
  };
  const client = new PdsClient({ connection });
  const requests = definePdsApi(notes);
  const api = client.bind(requests);

  assert.equal(getFunctionName(pdsFunctions.query), "pds:dispatchQuery");
  assert.equal(getFunctionName(pdsFunctions.mutation), "pds:dispatchMutation");
  assert.deepEqual(await api.notes.mutation.create({ body: "hello" }), {
    id: "note-1",
  });
  assert.deepEqual(await api.notes.query.list({ owner: "shawn" }), [
    { body: "hello", id: "note-1" },
  ]);
  assert.deepEqual(
    await client.queryWithRouting(requests.notes.list({ owner: "shawn" })),
    {
      data: [{ body: "hello", id: "note-1" }],
      routes: ["a.test", "b.test"],
    },
  );

  let live: unknown;
  api.notes.watch.list(
    { owner: "shawn" },
    (result) => {
      live = result;
    },
    assert.fail,
  );
  assert.deepEqual(live, [{ body: "live", id: "note-2" }]);
  assert.equal(calls.length, 4);
});

/** Convex's optimistic store for `pds:dispatchQuery`, keyed by args. */
function fakeOptimisticStore() {
  const results = new Map<string, { args: unknown; value: unknown }>();
  return {
    getAllQueries: () => [...results.values()],
    getQuery: (_query: unknown, args: unknown) =>
      results.get(JSON.stringify(args))?.value,
    setQuery: (_query: unknown, args: unknown, value: unknown) => {
      results.set(JSON.stringify(args), { args, value });
    },
  };
}

void test("adapts Convex optimistic updates to PDS requests", async () => {
  const requests = definePdsApi(notes);
  const mine = requests.notes.list({ owner: "shawn" });
  const theirs = requests.notes.list({ owner: "maya" });
  const store = fakeOptimisticStore();
  store.setQuery(pdsFunctions.query, mine, {
    routes: ["a.test"],
    value: [{ body: "saved", id: "note-1" }],
  });
  store.setQuery(pdsFunctions.query, theirs, { routes: [], value: [] });

  let applied: ((store: never) => void) | undefined;
  const connection: PdsConnection = {
    close: () => Promise.resolve(),
    mutation: (_mutation, _args, options) => {
      applied = options?.optimisticUpdate;
      return Promise.resolve({ id: "note-2" });
    },
    query: () => Promise.reject(new Error("unused")),
    subscribe: () => () => undefined,
  };
  const client = new PdsClient({ connection });
  await client.mutation(requests.notes.create({ body: "draft" }), {
    optimisticUpdate: (local) => {
      const lists = local.getAllQueries(requests.notes.list);
      assert.deepEqual(
        lists.map(({ args }) => args.owner),
        ["shawn", "maya"],
      );
      for (const { args, request, value } of lists) {
        if (args.owner !== "shawn" || value === undefined) continue;
        local.setQuery(request, [...value, { body: "draft", id: "note-2" }]);
      }
    },
  });
  assert.ok(applied);
  // Convex calls the update with its own store.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- The fake implements the methods PDS updates use.
  applied(store as never);
  assert.deepEqual(store.getQuery(pdsFunctions.query, mine), {
    routes: ["a.test"],
    value: [
      { body: "saved", id: "note-1" },
      { body: "draft", id: "note-2" },
    ],
  });
  assert.deepEqual(store.getQuery(pdsFunctions.query, theirs), {
    routes: [],
    value: [],
  });
});

void test("keeps the last result while an optimistic update shows loading", () => {
  const results: unknown[] = [];
  const connection: PdsConnection = {
    close: () => Promise.resolve(),
    mutation: () => Promise.reject(new Error("unused")),
    query: () => Promise.reject(new Error("unused")),
    subscribe: (_query, _args, onResult) => {
      onResult({ routes: [], value: [{ body: "one", id: "1" }] });
      onResult(undefined);
      return () => undefined;
    },
  };
  new PdsClient({ connection }).watchQuery(
    definePdsApi(notes).notes.list({ owner: "shawn" }),
    (result) => results.push(result),
    assert.fail,
  );
  assert.deepEqual(results, [[{ body: "one", id: "1" }]]);
});

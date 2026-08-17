import assert from "node:assert/strict";
import test from "node:test";
import {
  DECENTRALIZED_CONVEX_LAST_CHANGED,
  DECENTRALIZED_CONVEX_VERSION,
} from "@decentralized-convex/core";
import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { getFunctionName } from "convex/server";
import { v } from "convex/values";

import type { PdsConnection } from "./pds.ts";
import { definePdsApi, PdsClient, pdsFunctions } from "./pds.ts";

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
      args: v.object({ owner: v.string() }),
      returns: v.array(v.object({ body: v.string(), id: v.string() })),
    }),
  },
  requires: {},
});

void test("builds serializable PDS dispatcher requests", () => {
  const api = definePdsApi(notes);

  assert.deepEqual(api.notes.queries.list({ owner: "shawn" }), {
    lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.protocol,
    operation: { args: { owner: "shawn" }, type: "list" },
    plugin: "notes",
    version: DECENTRALIZED_CONVEX_VERSION,
  });
  assert.deepEqual(api.notes.mutations.create({ body: "hello" }), {
    lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.protocol,
    operation: { args: { body: "hello" }, type: "create" },
    plugin: "notes",
    version: DECENTRALIZED_CONVEX_VERSION,
  });
  assert.deepEqual(api.notes.list({ owner: "shawn" }), {
    lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.protocol,
    operation: { args: { owner: "shawn" }, type: "list" },
    plugin: "notes",
    version: DECENTRALIZED_CONVEX_VERSION,
  });
  assert.deepEqual(api.notes.create({ body: "hello" }), {
    lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.protocol,
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

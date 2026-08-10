import assert from "node:assert/strict";
import test from "node:test";
import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { getFunctionName } from "convex/server";
import { v } from "convex/values";

import type { PdsConnection } from "./pds.ts";
import { definePdsApi, PdsClient, pdsFunctions } from "./pds.ts";

const notes = definePluginProtocol({
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
  version: "1",
});

void test("builds serializable PDS dispatcher requests", () => {
  const api = definePdsApi({ notes });

  assert.deepEqual(api.notes.queries.list({ owner: "shawn" }), {
    operation: { args: { owner: "shawn" }, type: "list" },
    plugin: "notes",
    version: "1",
  });
  assert.deepEqual(api.notes.mutations.create({ body: "hello" }), {
    operation: { args: { body: "hello" }, type: "create" },
    plugin: "notes",
    version: "1",
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
      return Promise.resolve([{ body: "hello", id: "note-1" }]);
    },
    subscribe: (_query, args, onResult) => {
      calls.push(args);
      onResult([{ body: "live", id: "note-2" }]);
      return () => undefined;
    },
  };
  const client = new PdsClient({ connection });
  const api = client.bind(definePdsApi({ notes }));

  assert.equal(getFunctionName(pdsFunctions.query), "pds:dispatchQuery");
  assert.equal(getFunctionName(pdsFunctions.mutation), "pds:dispatchMutation");
  assert.deepEqual(await api.notes.mutation.create({ body: "hello" }), {
    id: "note-1",
  });
  assert.deepEqual(await api.notes.query.list({ owner: "shawn" }), [
    { body: "hello", id: "note-1" },
  ]);

  let live: unknown;
  api.notes.watch.list(
    { owner: "shawn" },
    (result) => {
      live = result;
    },
    assert.fail,
  );
  assert.deepEqual(live, [{ body: "live", id: "note-2" }]);
  assert.equal(calls.length, 3);
});

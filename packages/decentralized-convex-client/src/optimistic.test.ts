import assert from "node:assert/strict";
import test from "node:test";
import { decentralizedConvexPackage as corePackage } from "@decentralized-convex/core/metadata";
import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { v } from "convex/values";

import { pdsOptimisticLocalStore } from "./optimistic.ts";
import { definePdsApi, pdsFunctions } from "./pds.ts";

const notes = definePluginProtocol({
  lastChanged: corePackage.lastChanged,
  mutations: {
    create: defineOperation({
      args: v.object({ body: v.string() }),
      returns: v.object({ id: v.string() }),
    }),
  },
  name: "notes",
  queries: {
    list: defineOperation({
      args: v.object({ owner: v.string() }),
      returns: v.array(v.object({ body: v.string(), id: v.string() })),
    }),
  },
  requires: {},
});

/** Convex's optimistic store for `pds:dispatchQuery`, keyed by args. */
function fakeStore() {
  const results = new Map<string, { args: unknown; value: unknown }>();
  return {
    getAllQueries: () => [...results.values()],
    getQuery: (_query: unknown, args: unknown) =>
      results.get(JSON.stringify(args))?.value,
    results,
    setQuery: (_query: unknown, args: unknown, value: unknown) => {
      results.set(JSON.stringify(args), { args, value });
    },
  };
}

void test("updates a query subscribed without its includes, by its plain request", () => {
  const api = definePdsApi(notes);
  const mine = api.notes.queries.list({ owner: "shawn" });
  const store = fakeStore();
  // Subscriptions ask with `include: false` (see the PDS router).
  store.setQuery(
    pdsFunctions.query,
    { ...mine, include: false },
    { routes: ["a.test"], value: [{ body: "saved", id: "note-1" }] },
  );
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- The fake implements the methods PDS updates use.
  const local = pdsOptimisticLocalStore(store as never, pdsFunctions.query);
  assert.deepEqual(local.getQuery(mine), [{ body: "saved", id: "note-1" }]);
  local.setQuery(mine, [{ body: "draft", id: "note-2" }]);
  assert.deepEqual(
    store.getQuery(pdsFunctions.query, { ...mine, include: false }),
    { routes: ["a.test"], value: [{ body: "draft", id: "note-2" }] },
  );
  // The plain request wasn't loaded, so it isn't made up.
  assert.equal(store.results.size, 1);
});

import assert from "node:assert/strict";
import test from "node:test";
import { decentralizedConvexPackage as corePackage } from "@decentralized-convex/core/metadata";
import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { v } from "convex/values";

import { definePdsApi } from "./api.ts";
import { discoverPds } from "./discovery.ts";

const notes = definePluginProtocol({
  lastChanged: corePackage.lastChanged,
  name: "notes",
  mutations: {
    write: defineOperation({ args: v.object({}), returns: v.null() }),
  },
  queries: {
    read: defineOperation({ args: v.object({}), returns: v.null() }),
  },
  requires: {},
});
const api = definePdsApi(notes);

void test("normalizes an account address and returns a compatible home", async () => {
  const selection = await discoverPds({
    address: " Alice@Notes.Example ",
    api,
    resolveTxt: (name) => {
      assert.equal(name, "_pds.notes.example");
      return Promise.resolve([
        "v=pds1;url=https://notes.example/.well-known/decentralized-convex",
      ]);
    },
    fetch: () =>
      Promise.resolve(
        Response.json({
          accountDomain: "notes.example",
          capabilities: [{ id: "notes", lastChanged: corePackage.lastChanged }],
          deploymentUrl: "https://notes.example.convex.cloud",
          httpUrl: "https://notes.example",
          lastChanged: corePackage.lastChanged,
          version: "0.1.0",
        }),
      ),
  });

  assert.equal(selection.username, "alice");
  assert.equal(selection.home.domain, "notes.example");
});

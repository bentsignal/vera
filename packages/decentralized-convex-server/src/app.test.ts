import assert from "node:assert/strict";
import test from "node:test";
import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { defineComponent } from "convex/server";
import { v } from "convex/values";

import {
  definePdsApp,
  definePdsPluginComponent,
  protocolsFromPdsApp,
} from "./app.ts";

void test("a typed PDS plugin remains the original Convex Component", () => {
  const component = defineComponent("notes");
  const protocol = definePluginProtocol({
    name: "notes",
    mutations: {
      create: defineOperation({ args: v.object({}), returns: v.null() }),
    },
    queries: {
      list: defineOperation({ args: v.object({}), returns: v.null() }),
    },
    requires: {},
    version: "1",
  });

  const plugin = definePdsPluginComponent(component, protocol);

  assert.equal(plugin, component);
  assert.deepEqual(Object.keys(plugin), Object.keys(component));
});

void test("derives client protocols from the same local app declaration", () => {
  const accountsProtocol = definePluginProtocol({
    name: "accounts",
    mutations: {
      write: defineOperation({ args: v.object({}), returns: v.null() }),
    },
    queries: {
      read: defineOperation({ args: v.object({}), returns: v.null() }),
    },
    requires: {},
    version: "1",
  });
  const accounts = definePdsPluginComponent(
    defineComponent("accounts"),
    accountsProtocol,
  );
  const app = definePdsApp({ plugins: [accounts] });

  assert.deepEqual(protocolsFromPdsApp(app), [accountsProtocol]);
});

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
import { defineComponent } from "convex/server";
import { v } from "convex/values";

import {
  definePdsApp,
  definePdsPluginComponent,
  pdsReleaseFromApp,
  protocolsFromPdsApp,
} from "./app.ts";

void test("a typed PDS plugin remains the original Convex Component", () => {
  const component = defineComponent("notes");
  const protocol = definePluginProtocol({
    lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.protocol,
    name: "notes",
    mutations: {
      create: defineOperation({ args: v.object({}), returns: v.null() }),
    },
    queries: {
      list: defineOperation({ args: v.object({}), returns: v.null() }),
    },
    requires: {},
  });

  const plugin = definePdsPluginComponent(component, protocol);

  assert.equal(plugin, component);
  assert.deepEqual(Object.keys(plugin), Object.keys(component));
});

void test("derives client protocols from the same local app declaration", () => {
  const accountsProtocol = definePluginProtocol({
    lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.accounts,
    name: "accounts",
    mutations: {
      write: defineOperation({ args: v.object({}), returns: v.null() }),
    },
    queries: {
      read: defineOperation({ args: v.object({}), returns: v.null() }),
    },
    requires: {},
  });
  const accounts = definePdsPluginComponent(
    defineComponent("accounts"),
    accountsProtocol,
  );
  const app = definePdsApp({ plugins: [accounts] });

  assert.deepEqual(protocolsFromPdsApp(app), [accountsProtocol]);
  assert.deepEqual(pdsReleaseFromApp(app), {
    capabilities: [
      {
        id: "accounts",
        lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.accounts,
      },
    ],
    lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.protocol,
    version: DECENTRALIZED_CONVEX_VERSION,
  });
});

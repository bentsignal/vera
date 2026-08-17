import type { DecentralizedConvexVersion } from "@decentralized-convex/core";
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

import type { PdsProtocolsOf } from "./app.ts";
import { definePdsApp, definePdsPluginComponent } from "./app.ts";

function protocol<
  const Name extends string,
  const Requirements extends Readonly<
    Record<string, DecentralizedConvexVersion>
  >,
>(name: Name, requires: Requirements) {
  return definePluginProtocol({
    lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.protocol,
    name,
    mutations: {
      write: defineOperation({ args: v.object({}), returns: v.null() }),
    },
    queries: {
      read: defineOperation({ args: v.object({}), returns: v.null() }),
    },
    requires,
  });
}

const accounts = definePdsPluginComponent(
  defineComponent("accounts"),
  protocol("accounts", {}),
);
const messages = definePdsPluginComponent(
  defineComponent("messages"),
  protocol("messages", { accounts: DECENTRALIZED_CONVEX_VERSION }),
);

const _app = definePdsApp({ plugins: [accounts, messages] });

type InstalledProtocols = PdsProtocolsOf<typeof _app>;
const installedName: InstalledProtocols[number]["name"] = "messages";
void installedName;

// @ts-expect-error -- the app type contains only installed plugin protocols.
const unknownInstalledName: InstalledProtocols[number]["name"] = "unknown";
void unknownInstalledName;

// @ts-expect-error -- messages requires the accounts plugin.
definePdsApp({ plugins: [messages] });

// @ts-expect-error -- plugin names must be unique within a PDS.
definePdsApp({ plugins: [accounts, accounts] });

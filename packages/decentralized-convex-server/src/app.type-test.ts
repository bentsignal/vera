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
  const Version extends string,
  const Requirements extends Readonly<Record<string, string>>,
>(name: Name, version: Version, requires: Requirements) {
  return definePluginProtocol({
    name,
    mutations: {
      write: defineOperation({ args: v.object({}), returns: v.null() }),
    },
    queries: {
      read: defineOperation({ args: v.object({}), returns: v.null() }),
    },
    requires,
    version,
  });
}

const accounts = definePdsPluginComponent(
  defineComponent("accounts"),
  protocol("accounts", "1", {}),
);
const accountsV2 = definePdsPluginComponent(
  defineComponent("accounts_v2"),
  protocol("accounts", "2", {}),
);
const messages = definePdsPluginComponent(
  defineComponent("messages"),
  protocol("messages", "1", { accounts: "1" }),
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

// @ts-expect-error -- accounts@2 does not satisfy messages' requirement.
definePdsApp({ plugins: [accountsV2, messages] });

// @ts-expect-error -- plugin names must be unique within a PDS.
definePdsApp({ plugins: [accounts, accounts] });

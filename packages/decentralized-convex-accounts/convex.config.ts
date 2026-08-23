import { definePdsPluginComponent } from "@decentralized-convex/server";
import { defineComponent } from "convex/server";

import { accountsProtocol } from "./protocol.ts";

export default definePdsPluginComponent(
  defineComponent(accountsProtocol.name),
  accountsProtocol,
);

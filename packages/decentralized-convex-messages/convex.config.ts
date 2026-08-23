import { definePdsPluginComponent } from "@decentralized-convex/server";
import { defineComponent } from "convex/server";

import { messagesProtocol } from "./protocol.ts";

export default definePdsPluginComponent(
  defineComponent(messagesProtocol.name),
  messagesProtocol,
);

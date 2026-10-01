import { definePdsApi } from "@decentralized-convex/client";
import { protocolsFromPdsApp } from "@decentralized-convex/server";

import app from "./convex/convex.config.ts";

/** Runtime protocols and client API inferred from the backend's plugin declaration. */
export const protocols = protocolsFromPdsApp(app);
export const pds = definePdsApi(...protocols);

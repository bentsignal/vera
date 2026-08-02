import { registerFederationRoutes } from "@decentralized-convex/server";
import { httpRouter } from "convex/server";

import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { requireEnvironment } from "./lib";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });
registerFederationRoutes(http, httpAction, {
  descriptor: () => ({
    auth: {
      issuer: requireEnvironment("CONVEX_SITE_URL"),
      jwksUrl: `${requireEnvironment("CONVEX_SITE_URL")}/api/auth/convex/jwks`,
    },
    capabilities: [{ id: "vera.chat", versions: ["1"] }],
    deploymentUrl: requireEnvironment("CONVEX_CLOUD_URL"),
    protocolVersion: "0.1",
  }),
});

export default http;

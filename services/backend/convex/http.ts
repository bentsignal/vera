import {
  protocolCapabilities,
  registerFederationRoutes,
} from "@decentralized-convex/server";
import { httpRouter } from "convex/server";

import { protocols } from "../pds";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { requireEnvironment } from "./lib";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });
registerFederationRoutes(http, httpAction, {
  descriptor: () => ({
    accountDomain: requireEnvironment("FEDERATION_DOMAIN"),
    auth: {
      issuer: requireEnvironment("CONVEX_SITE_URL"),
      jwksUrl: `${requireEnvironment("CONVEX_SITE_URL")}/api/auth/convex/jwks`,
    },
    capabilities: protocolCapabilities(...protocols),
    deploymentUrl: requireEnvironment("CONVEX_CLOUD_URL"),
    httpUrl: requireEnvironment("CONVEX_SITE_URL"),
    protocolVersion: "0.1",
  }),
});

export default http;

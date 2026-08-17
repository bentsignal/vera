import {
  pdsDescriptorFromApp,
  registerFederationRoutes,
} from "@decentralized-convex/server";
import { httpRouter } from "convex/server";

import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import app from "./convex.config";
import { requireEnvironment } from "./lib";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });
registerFederationRoutes(http, httpAction, {
  descriptor: () =>
    pdsDescriptorFromApp(app, {
      accountDomain: requireEnvironment("FEDERATION_DOMAIN"),
      auth: {
        issuer: requireEnvironment("CONVEX_SITE_URL"),
        jwksUrl: `${requireEnvironment("CONVEX_SITE_URL")}/api/auth/convex/jwks`,
      },
      deploymentUrl: requireEnvironment("CONVEX_CLOUD_URL"),
      httpUrl: requireEnvironment("CONVEX_SITE_URL"),
    }),
});

export default http;

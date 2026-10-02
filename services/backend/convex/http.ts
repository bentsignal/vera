import {
  pdsDescriptorFromApp,
  registerFederationRoutes,
} from "@decentralized-convex/server";
import { httpRouter } from "convex/server";

import { httpAction } from "./_generated/server";
import { androidAssetLinks, appleAppSiteAssociation } from "./appAssociation";
import { authComponent, createAuth } from "./auth";
import app from "./convex.config";
import { requireEnvironment } from "./lib";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });
registerFederationRoutes(http, httpAction, {
  descriptor: () =>
    pdsDescriptorFromApp(app, {
      accountDomain: requireEnvironment("FEDERATION_DOMAIN"),
      deploymentUrl: requireEnvironment("CONVEX_CLOUD_URL"),
      httpUrl: requireEnvironment("CONVEX_SITE_URL"),
    }),
});

http.route({
  handler: appleAppSiteAssociation,
  method: "GET",
  path: "/.well-known/apple-app-site-association",
});
http.route({
  handler: androidAssetLinks,
  method: "GET",
  path: "/.well-known/assetlinks.json",
});

export default http;

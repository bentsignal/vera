import {
  pdsDescriptorFromApp,
  registerFederationRoutes,
} from "@decentralized-convex/server";
import { httpRouter } from "convex/server";

import { httpAction } from "./_generated/server";
import { androidAssetLinks, appleAppSiteAssociation } from "./appAssociation";
import { authComponent, createAuth } from "./auth";
import app from "./convex.config";
import { joinPage } from "./joinPage";
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

// Space invite links, for when the app doesn't open them itself.
http.route({ handler: joinPage, method: "GET", pathPrefix: "/join/" });
http.route({ handler: joinPage, method: "GET", pathPrefix: "/dev/join/" });

// vera.chat points at this deployment for passkeys; people visiting it
// belong on the website.
http.route({
  handler: httpAction(() =>
    Promise.resolve(Response.redirect("https://www.vera.chat", 302)),
  ),
  method: "GET",
  path: "/",
});

export default http;

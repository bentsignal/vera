import { httpRouter } from "convex/server";

import { httpAction } from "./_generated/server";
import {
  checkoutHandler,
  customerPortalHandler,
  planSyncHandler,
  preflightHandler,
  webhookHandler,
} from "./billing/routes";
import { resend } from "./resend";

const http = httpRouter();

http.route({
  path: "/polar/events",
  method: "POST",
  handler: webhookHandler,
});

http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await resend.handleResendEventWebhook(ctx, req);
  }),
});

http.route({ path: "/checkout", method: "OPTIONS", handler: preflightHandler });
http.route({ path: "/checkout", method: "POST", handler: checkoutHandler });

http.route({
  path: "/customer-portal",
  method: "OPTIONS",
  handler: preflightHandler,
});
http.route({
  path: "/customer-portal",
  method: "POST",
  handler: customerPortalHandler,
});

http.route({ path: "/plan", method: "OPTIONS", handler: preflightHandler });
http.route({ path: "/plan", method: "POST", handler: planSyncHandler });

export default http;

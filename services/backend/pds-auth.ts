import { betterAuthAdapter } from "@decentralized-convex/auth-better-auth";

import { actorFromEmail, requireEnvironment } from "./convex/lib";

/** Shared by convex.config, the normal Better Auth factory, and PDS discovery. */
export const pdsAuth = betterAuthAdapter({
  accountDomain: () => requireEnvironment("FEDERATION_DOMAIN"),
  getAccountId: (user) => actorFromEmail(user.email),
  issuer: () => requireEnvironment("CONVEX_SITE_URL"),
});

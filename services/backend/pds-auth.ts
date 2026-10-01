import betterAuthComponent from "@convex-dev/better-auth/convex.config";
import { betterAuthAdapter } from "@decentralized-convex/auth-better-auth";

import { actorFromEmail, requireEnvironment } from "./convex/lib";

/** Shared by convex.config, the normal Better Auth factory, and PDS discovery. */
export const pdsAuth = betterAuthAdapter({
  accountDomain: () => requireEnvironment("FEDERATION_DOMAIN"),
  // Convex replaces config-time Component imports with generated references.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  component: betterAuthComponent,
  getAccountId: (user) => actorFromEmail(user.email),
  issuer: () => requireEnvironment("CONVEX_SITE_URL"),
});

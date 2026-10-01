import type { BetterAuthPlugin } from "better-auth";

import type { BetterAuthPdsAdapter } from "./adapter.ts";
import { betterAuthRuntimeConfig } from "./adapter.ts";
import { createFederationPlugin } from "./federation-plugin.ts";

/** Adds the PDS federation endpoints to a normal Better Auth configuration. */
export function betterAuthPdsPlugin(
  adapter: BetterAuthPdsAdapter,
): BetterAuthPlugin {
  return createFederationPlugin(adapter[betterAuthRuntimeConfig]());
}

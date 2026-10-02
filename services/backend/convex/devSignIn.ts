import type { BetterAuthPlugin } from "better-auth";
import { formatAddress, parseAddress } from "@decentralized-convex/address";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

import { optionalEnvironment, requireEnvironment } from "./lib";

/**
 * Development only: signs in as any username without a passkey, because iOS
 * Simulator builds cannot use passkeys. Installed only when `DEV_TOOLS` is
 * "true", which is never set on production.
 */
export function devSignIn(): BetterAuthPlugin {
  return {
    endpoints: {
      devSignIn: createAuthEndpoint(
        "/dev/sign-in",
        { body: z.object({ username: z.string().min(1) }), method: "POST" },
        async (ctx) => {
          let address: string;
          try {
            address = formatAddress(
              parseAddress(
                `${ctx.body.username}@${requireEnvironment("FEDERATION_DOMAIN")}`,
              ),
            );
          } catch {
            throw new APIError("BAD_REQUEST", { code: "INVALID_USERNAME" });
          }
          const { internalAdapter } = ctx.context;
          const user =
            (await internalAdapter.findUserByEmail(address))?.user ??
            (await internalAdapter.createUser({
              email: address,
              emailVerified: false,
              name: address.slice(0, address.lastIndexOf("@")),
            }));
          const session = await internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return { address };
        },
      ),
    },
    id: "vera-dev-sign-in",
  };
}

export function devToolsEnabled() {
  return optionalEnvironment("DEV_TOOLS") === "true";
}

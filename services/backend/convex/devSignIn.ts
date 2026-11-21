import type { BetterAuthPlugin } from "better-auth";
import { formatAddress, parseAddress } from "@decentralized-convex/address";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

import {
  DEV_TOOLS_SECRET_HEADER,
  devToolsOn,
  devToolsSecretAccepted,
} from "../dev-tools";
import { optionalEnvironment, requireEnvironment } from "./lib";

/**
 * Development only: signs in as any username without a passkey, because iOS
 * Simulator builds cannot use passkeys. Installed only when `DEV_TOOLS` is
 * "true" and `DEV_TOOLS_SECRET` is set, which production never does, and
 * each request must carry that secret (../dev-tools.ts).
 */
export function devSignIn(): BetterAuthPlugin {
  return {
    endpoints: {
      devSignIn: createAuthEndpoint(
        "/dev/sign-in",
        { body: z.object({ username: z.string().min(1) }), method: "POST" },
        async (ctx) => {
          if (
            !devToolsSecretMatches(ctx.headers?.get(DEV_TOOLS_SECRET_HEADER))
          ) {
            throw new APIError("FORBIDDEN", {
              code: "DEV_TOOLS_SECRET_REQUIRED",
            });
          }
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

function devToolsEnvironment() {
  return {
    DEV_TOOLS: optionalEnvironment("DEV_TOOLS") ?? undefined,
    DEV_TOOLS_SECRET: optionalEnvironment("DEV_TOOLS_SECRET") ?? undefined,
  };
}

export function devToolsEnabled() {
  return devToolsOn(devToolsEnvironment());
}

export function devToolsSecretMatches(given: unknown) {
  return devToolsSecretAccepted(devToolsEnvironment(), given);
}

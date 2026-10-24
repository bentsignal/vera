import type { GenericCtx } from "@convex-dev/better-auth";
import type { GenericEndpointContext } from "better-auth";
import { expo } from "@better-auth/expo";
import { passkey } from "@better-auth/passkey";
import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import {
  DEFAULT_RESERVED_USERNAMES,
  formatAddress,
  isReservedUsername,
  parseAddress,
} from "@decentralized-convex/address";
import { betterAuthPdsPlugin } from "@decentralized-convex/auth-better-auth/runtime";
import { APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { betterAuth } from "better-auth/minimal";

import type { DataModel } from "./_generated/dataModel";
import { pdsAuth } from "../pds-auth";
import { components, internal } from "./_generated/api";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import betterAuthSchema from "./betterAuth/schema";
import { devSignIn, devToolsEnabled } from "./devSignIn";
import { actorFromEmail, requireEnvironment } from "./lib";

export const authComponent = createClient<DataModel, typeof betterAuthSchema>(
  components.betterAuth,
  { local: { schema: betterAuthSchema } },
);

/** Names nobody can sign up with. */
const RESERVED_USERNAMES = [
  ...DEFAULT_RESERVED_USERNAMES,
  "vera",
  "vera_app",
  "vera_chat",
  "vera_help",
  "vera_official",
  "vera_support",
  "vera_team",
  "team_vera",
];

/** Client-supplied context for passkey-first sign-up. */
interface SignUpRequest {
  readonly address: string;
  readonly username: string;
}

export function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth({
    baseURL: requireEnvironment("CONVEX_SITE_URL"),
    database: authComponent.adapter(ctx),
    plugins: [
      expo(),
      convex({
        authConfig,
        jwksRotateOnTokenGenerationError: true,
        jwt: {
          definePayload: ({ user }) => ({
            accountId: actorFromEmail(user.email),
            email: user.email,
            name: user.name,
          }),
        },
      }),
      passkey({
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
        origin: requireEnvironment("PASSKEY_ORIGINS")
          .split(",")
          .map((origin) => origin.trim()),
        registration: {
          // Passkeys are the only credential, so sign-up registers one
          // before the account exists.
          requireSession: false,
          resolveUser: async ({ context, ctx: endpoint }) => {
            const request = await validateSignUp(endpoint, context);
            return {
              displayName: request.username,
              id: crypto.randomUUID(),
              name: request.address,
            };
          },
          afterVerification: async ({ context, ctx: endpoint }) => {
            const request = await validateSignUp(endpoint, context);
            const user = await endpoint.context.internalAdapter.createUser({
              email: request.address,
              emailVerified: false,
              name: request.username,
            });
            const session =
              await endpoint.context.internalAdapter.createSession(user.id);
            await setSessionCookie(endpoint, { session, user });
            return { userId: user.id };
          },
        },
        rpID: requireEnvironment("PASSKEY_RP_ID"),
        rpName: "Vera",
      }),
      betterAuthPdsPlugin(pdsAuth),
      ...(devToolsEnabled() ? [devSignIn()] : []),
    ],
    databaseHooks: {
      user: {
        create: {
          // Every new account hears from the support account first, then
          // from Vera, the assistant.
          after: async (user) => {
            if (!("scheduler" in ctx)) return;
            const accountId = actorFromEmail(user.email);
            await ctx.scheduler.runAfter(0, internal.support.welcome, {
              accountId,
            });
            await ctx.scheduler.runAfter(2000, internal.vera.welcome, {
              accountId,
            });
          },
        },
      },
    },
    // The app's schemes: Vera, and Vera Dev (the dev variant, app.config.ts).
    trustedOrigins: ["vera://", "vera-dev://"],
  });
}

async function validateSignUp(
  endpoint: GenericEndpointContext,
  context: string | null | undefined,
): Promise<SignUpRequest> {
  const username = parseSignUpContext(context);
  let address: string;
  try {
    address = formatAddress(
      parseAddress(`${username}@${requireEnvironment("FEDERATION_DOMAIN")}`),
    );
  } catch {
    throw new APIError("BAD_REQUEST", { code: "INVALID_USERNAME" });
  }
  const normalizedUsername = address.slice(0, address.lastIndexOf("@"));
  if (
    isReservedUsername(normalizedUsername, RESERVED_USERNAMES) ||
    (await endpoint.context.internalAdapter.findUserByEmail(address)) !== null
  ) {
    throw new APIError("BAD_REQUEST", { code: "USERNAME_TAKEN" });
  }
  return { address, username: normalizedUsername };
}

/**
 * The username from the sign-up context. Older app versions also send an
 * invite code, which is ignored.
 */
function parseSignUpContext(context: string | null | undefined) {
  try {
    const value: unknown = JSON.parse(context ?? "");
    if (
      typeof value === "object" &&
      value !== null &&
      "username" in value &&
      typeof value.username === "string"
    ) {
      return value.username.trim();
    }
  } catch {
    // Fall through to the shared error below.
  }
  throw new APIError("BAD_REQUEST", { code: "INVALID_SIGN_UP_REQUEST" });
}

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const user = await authComponent.getAuthUser(ctx);
    return {
      actor: actorFromEmail(user.email),
    };
  },
});

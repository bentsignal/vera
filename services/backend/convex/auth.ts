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

import type { DeviceProof } from "../sign-up-devices";
import type { DataModel } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { pdsAuth } from "../pds-auth";
import { DeviceRefused, parseDeviceProof } from "../sign-up-devices";
import { components, internal } from "./_generated/api";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import betterAuthSchema from "./betterAuth/schema";
import { devSignIn, devToolsEnabled } from "./devSignIn";
import { actorFromEmail, requireEnvironment } from "./lib";
import { signUpDeviceStep } from "./signUpDevices";

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
  /** The phone's proof for the one-account-per-phone check (signUpDevices.ts). */
  readonly device: DeviceProof | null;
  /** As the app sent it, which its Android proof is tied to. */
  readonly requestedUsername: string;
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
          // A day, not the plugin's 15 minutes: the app renews it well
          // before then, while it's open or as it's left, so a phone coming
          // back has one and loads at once instead of waiting for a new one
          // (apps/mobile/src/features/session/account-session.ts).
          expirationSeconds: 24 * 60 * 60,
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
            await deviceStep(() =>
              signUpDeviceStep(actionCtx(ctx), "check", deviceAttempt(request)),
            );
            return {
              displayName: request.username,
              id: crypto.randomUUID(),
              name: request.address,
            };
          },
          afterVerification: async ({ context, ctx: endpoint }) => {
            const request = await validateSignUp(endpoint, context);
            const counted = await deviceStep(() =>
              signUpDeviceStep(
                actionCtx(ctx),
                "finish",
                deviceAttempt(request),
              ),
            );
            const user = await endpoint.context.internalAdapter.createUser({
              email: request.address,
              emailVerified: false,
              name: request.username,
            });
            const session =
              await endpoint.context.internalAdapter.createSession(user.id);
            await setSessionCookie(endpoint, { session, user });
            await counted();
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
          // Every new account hears from Vera, the assistant.
          after: async (user) => {
            if (!("scheduler" in ctx)) return;
            await ctx.scheduler.runAfter(0, internal.vera.welcome, {
              accountId: actorFromEmail(user.email),
            });
          },
        },
      },
    },
    // The app's schemes: Vera, and Vera Dev (the dev variant, app.config.ts).
    trustedOrigins: ["vera://", "vera-dev://"],
  });
}

function deviceAttempt(request: SignUpRequest) {
  return {
    address: request.address,
    device: request.device,
    username: request.requestedUsername,
  };
}

/** Sign-up routes run in an HTTP action, which can call functions. */
function actionCtx(ctx: GenericCtx<DataModel>): ActionCtx {
  if (!isActionCtx(ctx)) {
    throw new DeviceRefused("DEVICE_CHECK_UNAVAILABLE", "not an action");
  }
  return ctx;
}

function isActionCtx(ctx: GenericCtx<DataModel>): ctx is ActionCtx {
  return "runAction" in ctx;
}

/** Runs a device check, turning its refusal into the app's error code. */
async function deviceStep<Result>(step: () => Promise<Result>) {
  try {
    return await step();
  } catch (error) {
    if (!(error instanceof DeviceRefused)) throw error;
    console.warn(`sign-up refused: ${error.message}`);
    throw new APIError("BAD_REQUEST", { code: error.code });
  }
}

async function validateSignUp(
  endpoint: GenericEndpointContext,
  context: string | null | undefined,
): Promise<SignUpRequest> {
  const { device, username } = parseSignUpContext(context);
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
  return {
    address,
    device,
    requestedUsername: username,
    username: normalizedUsername,
  };
}

/**
 * The username, and the phone's proof, from the sign-up context. Older app
 * versions send no proof, and some an invite code, which is ignored.
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
      return {
        device: parseDeviceProof("device" in value ? value.device : null),
        username: value.username.trim(),
      };
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

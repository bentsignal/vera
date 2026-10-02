import type {
  PasskeyCreateRequest,
  PasskeyGetRequest,
} from "react-native-passkey";
import { Passkey } from "react-native-passkey";

import type { HomeAuthClient } from "./auth-client";
import type { PendingSignIn } from "./pending-sign-in";
import { finishPendingSignIn } from "./pending-sign-in";

const SIGN_UP_ERRORS = new Map([
  ["INVALID_SIGN_UP_REQUEST", "Enter an invite code and a username."],
  [
    "INVALID_USERNAME",
    "Usernames are 2–32 characters: letters, numbers, dots, dashes, or underscores.",
  ],
  ["INVITE_CODE_INACTIVE", "That invite code isn't valid."],
  ["USERNAME_TAKEN", "That username is taken."],
]);

/** A message for the person, or null when they cancelled the passkey sheet. */
function describe(error: unknown, fallback: string) {
  if (typeof error !== "object" || error === null) return fallback;
  if ("error" in error && error.error === "UserCancelled") return null;
  if ("code" in error && typeof error.code === "string") {
    return SIGN_UP_ERRORS.get(error.code) ?? fallback;
  }
  return fallback;
}

async function request<Result>(
  authClient: HomeAuthClient,
  path: string,
  init: { body?: object; query?: Record<string, string> },
) {
  const { data, error } = await authClient.$fetch<Result>(path, {
    body: init.body,
    method: init.body === undefined ? "GET" : "POST",
    query: init.query,
  });
  if (error !== null) throw error;
  return data;
}

/**
 * Passkey-first sign-up: the server checks the invite and username, the
 * device creates a passkey, and verifying it creates the account and session.
 * Returns an error message, or null when cancelled or successful.
 */
export async function createAccount(
  pending: PendingSignIn,
  details: { inviteCode: string; username: string },
) {
  const { authClient } = pending;
  try {
    const options = await request<PasskeyCreateRequest>(
      authClient,
      "/passkey/generate-register-options",
      { query: { context: JSON.stringify(details) } },
    );
    const response = await Passkey.create(options);
    await request(authClient, "/passkey/verify-registration", {
      body: { response },
    });
    return await finishPendingSignIn(pending);
  } catch (error) {
    return describe(error, "Couldn't create your account. Try again.");
  }
}

/**
 * Signs in with any passkey saved for Vera. Returns an error message, or
 * null when cancelled or successful.
 */
export async function signIn(pending: PendingSignIn) {
  const { authClient } = pending;
  try {
    const options = await request<PasskeyGetRequest>(
      authClient,
      "/passkey/generate-authenticate-options",
      {},
    );
    const response = await Passkey.get(options);
    await request(authClient, "/passkey/verify-authentication", {
      body: { response },
    });
    return await finishPendingSignIn(pending);
  } catch (error) {
    return describe(error, "Couldn't sign in. Try again.");
  }
}

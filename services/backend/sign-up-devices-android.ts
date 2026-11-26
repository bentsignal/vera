// Android: Google Play Integrity (sign-up-devices.ts). Google decodes the
// app's token and says whether it came from Vera as installed from Play,
// on a real, unmodified phone; its nonce ties it to the phone's Android ID
// and the username. Sign-ups are counted by that Android ID, which stays
// the same for Vera across reinstalls and changes on a factory reset.
// (Play's own per-phone bits, "device recall", are a closed beta.)

import type {
  DeviceCheckConfig,
  GoogleSettings,
} from "./sign-up-devices-core.ts";
import {
  DeviceRefused,
  field,
  sha256,
  signJwt,
  text,
} from "./sign-up-devices-core.ts";

/** How long after the app asked Google a token is still accepted. */
export const ANDROID_TOKEN_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * The nonce the app puts in its request (modules/device-proof computes the
 * same), so a token can't be replayed for another phone or sign-up.
 */
export function androidNonce(androidId: string, username: string) {
  return sha256(`vera-sign-up\n${androidId.toLowerCase()}\n${username}`);
}

/** The key the phone's sign-ups are counted under: its Android ID, hashed. */
export async function androidDeviceKey(androidId: string) {
  return `android:${await sha256(`vera-device\n${androidId.toLowerCase()}`)}`;
}

function invalid(detail: string): never {
  throw new DeviceRefused("DEVICE_PROOF_INVALID", detail);
}

/** Refuses a decoded verdict that isn't Vera from Play, for this sign-up. */
export function judgeAndroidVerdict(
  verdict: unknown,
  expected: { nonce: string; now: number; packageName: string },
) {
  const details = field(verdict, "requestDetails");
  if (text(details, "requestPackageName") !== expected.packageName) {
    invalid("another app's token");
  }
  if (text(details, "nonce")?.replace(/=+$/, "") !== expected.nonce) {
    invalid("the token is for another sign-up");
  }
  const age = expected.now - Number(field(details, "timestampMillis"));
  if (!(age >= -60_000 && age <= ANDROID_TOKEN_MAX_AGE_MS)) {
    invalid("the token is too old");
  }
  const app = text(field(verdict, "appIntegrity"), "appRecognitionVerdict");
  if (app !== "PLAY_RECOGNIZED") invalid("not Vera from Google Play");
  const device = field(
    field(verdict, "deviceIntegrity"),
    "deviceRecognitionVerdict",
  );
  if (!Array.isArray(device) || !device.includes("MEETS_DEVICE_INTEGRITY")) {
    invalid("not a genuine Android phone");
  }
}

async function accessToken(google: GoogleSettings, fetcher: typeof fetch) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    {},
    {
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
      iss: google.serviceAccount.clientEmail,
      scope: "https://www.googleapis.com/auth/playintegrity",
    },
    google.serviceAccount.privateKey,
    "RS256",
  );
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      assertion,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
    method: "POST",
  });
  const token = response.ok
    ? text(await response.json(), "access_token")
    : undefined;
  if (token === undefined) {
    throw new DeviceRefused(
      "DEVICE_CHECK_UNAVAILABLE",
      `Google sign-in ${response.status}`,
    );
  }
  return token;
}

/**
 * Checks an Android proof with Google and returns the key its sign-ups are
 * counted under. Google decodes each token once (decoding again comes back
 * empty), so only the sign-up's start calls this.
 */
export async function androidDevice(
  config: DeviceCheckConfig,
  proof: { readonly androidId: string; readonly token: string },
  username: string,
  fetcher: typeof fetch = fetch,
) {
  const { google } = config;
  if (google === null) {
    throw new DeviceRefused(
      "DEVICE_CHECK_UNAVAILABLE",
      "Play Integrity isn't configured",
    );
  }
  const response = await fetcher(
    `https://playintegrity.googleapis.com/v1/${google.packageName}:decodeIntegrityToken`,
    {
      body: JSON.stringify({ integrityToken: proof.token }),
      headers: {
        Authorization: `Bearer ${await accessToken(google, fetcher)}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
  if (response.status === 400) invalid("Google couldn't decode the token");
  if (!response.ok) {
    throw new DeviceRefused(
      "DEVICE_CHECK_UNAVAILABLE",
      `Play Integrity ${response.status}`,
    );
  }
  judgeAndroidVerdict(field(await response.json(), "tokenPayloadExternal"), {
    nonce: await androidNonce(proof.androidId, username),
    now: Date.now(),
    packageName: google.packageName,
  });
  return androidDeviceKey(proof.androidId);
}

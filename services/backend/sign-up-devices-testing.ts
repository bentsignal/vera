// Fakes for the sign-up device tests: Apple, Google, and the PDS's store.

import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";

import type {
  DeviceCheckConfig,
  DeviceRefusal,
  SignUpAttempt,
  SignUpDeviceStore,
} from "./sign-up-devices.ts";
import { androidNonce } from "./sign-up-devices-android.ts";
import { field, text } from "./sign-up-devices-core.ts";
import {
  checkSignUpDevice,
  deviceCheckConfig,
  DeviceRefused,
  finishSignUpDevice,
  hasRoom,
} from "./sign-up-devices.ts";

const APPLE_KEY = generateKeyPairSync("ec", { namedCurve: "P-256" })
  .privateKey.export({ format: "pem", type: "pkcs8" })
  .toString();
const GOOGLE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ format: "pem", type: "pkcs8" })
  .toString();

export const CONFIG = deviceCheckConfig({
  APPLE_TEAM_ID: "TEAM",
  DEVICECHECK_KEY_ID: "KEY",
  DEVICECHECK_PRIVATE_KEY: APPLE_KEY,
  PLAY_INTEGRITY_SERVICE_ACCOUNT: JSON.stringify({
    client_email: "integrity@example.iam.gserviceaccount.com",
    private_key: GOOGLE_KEY,
  }),
});

function bodyText(init: RequestInit | undefined) {
  const body = init?.body;
  if (typeof body === "string") return body;
  return body instanceof URLSearchParams ? body.toString() : "";
}

function urlOf(input: string | URL | Request) {
  return input instanceof Request ? input.url : input.toString();
}

function decodePart(part: string | undefined): unknown {
  return JSON.parse(Buffer.from(part ?? "", "base64url").toString());
}

/** Apple accepts only an ES256 JWT from the team's DeviceCheck key. */
function assertAppleJwt(authorization: string | null) {
  const [header, claims, signature] = (authorization ?? "")
    .replace("Bearer ", "")
    .split(".");
  assert.deepEqual(decodePart(header), {
    alg: "ES256",
    kid: "KEY",
    typ: "JWT",
  });
  assert.equal(field(decodePart(claims), "iss"), "TEAM");
  assert.ok(
    verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      { dsaEncoding: "ieee-p1363", key: createPublicKey(APPLE_KEY) },
      Buffer.from(signature, "base64url"),
    ),
  );
}

/**
 * Apple's DeviceCheck: two bits per phone, keyed here by its token. Tokens
 * start with "phone-"; `developmentOnly` ones are known only to the
 * development host.
 */
export function fakeApple(
  options: { developmentOnly?: string[]; down?: boolean } = {},
) {
  const bits = new Map<string, { bit0: boolean; bit1: boolean }>();
  function answer(url: string, body: unknown) {
    const token = text(body, "device_token") ?? "";
    const development = url.includes("api.development.");
    const known =
      token.startsWith("phone-") &&
      development === (options.developmentOnly?.includes(token) ?? false);
    if (!known) return new Response("Bad Device Token", { status: 400 });
    if (url.endsWith("/update_two_bits")) {
      bits.set(token, {
        bit0: field(body, "bit0") === true,
        bit1: field(body, "bit1") === true,
      });
      return new Response("", { status: 200 });
    }
    const state = bits.get(token);
    return state === undefined
      ? new Response("Failed to find bit state", { status: 200 })
      : Response.json({ ...state, last_update_time: "2026-11" });
  }
  function fetcher(input: string | URL | Request, init?: RequestInit) {
    if (options.down === true) {
      return Promise.resolve(new Response("busy", { status: 503 }));
    }
    assertAppleJwt(new Headers(init?.headers).get("Authorization"));
    const body: unknown = JSON.parse(bodyText(init));
    return Promise.resolve(answer(urlOf(input), body));
  }
  return { bits, fetcher };
}

export const ANDROID_ID = "1f2e3d4c5b6a7980";

/** Google: signs the service account in, then decodes tokens (JSON here). */
export function fakeGoogle() {
  let decodes = 0;
  function fetcher(input: string | URL | Request, init?: RequestInit) {
    const url = urlOf(input);
    if (url === "https://oauth2.googleapis.com/token") {
      const assertion = new URLSearchParams(bodyText(init)).get("assertion");
      assert.equal(assertion?.split(".").length, 3);
      return Promise.resolve(Response.json({ access_token: "access" }));
    }
    assert.equal(
      url,
      "https://playintegrity.googleapis.com/v1/chat.vera.app:decodeIntegrityToken",
    );
    decodes += 1;
    const token = text(JSON.parse(bodyText(init)), "integrityToken") ?? "";
    if (!token.startsWith("{")) {
      return Promise.resolve(new Response("bad token", { status: 400 }));
    }
    const verdict: unknown = JSON.parse(token);
    return Promise.resolve(Response.json({ tokenPayloadExternal: verdict }));
  }
  return { decodes: () => decodes, fetcher };
}

/** A token as a genuine phone running Vera from Play would get it. */
export async function androidToken(
  username: string,
  overrides: {
    app?: string;
    at?: number;
    device?: string[];
    nonceFor?: string;
    packageName?: string;
  } = {},
) {
  return JSON.stringify({
    appIntegrity: { appRecognitionVerdict: overrides.app ?? "PLAY_RECOGNIZED" },
    deviceIntegrity: {
      deviceRecognitionVerdict: overrides.device ?? ["MEETS_DEVICE_INTEGRITY"],
    },
    requestDetails: {
      nonce: await androidNonce(ANDROID_ID, overrides.nonceFor ?? username),
      requestPackageName: overrides.packageName ?? "chat.vera.app",
      timestampMillis: String(overrides.at ?? Date.now()),
    },
  });
}

export function iphone(username: string, token = "phone-1"): SignUpAttempt {
  return {
    address: `${username}@vera.chat`,
    device: { platform: "ios", token },
    username,
  };
}

export function android(
  username: string,
  token: string,
  androidId = ANDROID_ID,
): SignUpAttempt {
  return {
    address: `${username}@vera.chat`,
    device: { androidId, platform: "android", token },
    username,
  };
}

/** The PDS's side, in memory (convex/signUpDevices.ts keeps it in tables). */
export function memoryStore() {
  const accounts = new Map<string, number>();
  const claims: { address: string; deviceKey: string; expiresAt: number }[] =
    [];
  const allowances = new Set<string>();
  let locked = false;
  const store: SignUpDeviceStore = {
    lock: () => {
      const free = !locked;
      locked = true;
      return Promise.resolve(free);
    },
    unlock: () => {
      locked = false;
      return Promise.resolve();
    },
    allowed: (address) => Promise.resolve(allowances.has(address)),
    claim: (address, deviceKey, limit) => {
      const room = hasRoom({
        accounts: accounts.get(deviceKey) ?? 0,
        address,
        claims: claims.filter((claim) => claim.deviceKey === deviceKey),
        limit,
        now: Date.now(),
      });
      if (room) {
        claims.push({ address, deviceKey, expiresAt: Date.now() + 900_000 });
      }
      return Promise.resolve(room);
    },
    finish: (address) => {
      const index = claims.findIndex((claim) => claim.address === address);
      if (index === -1) return Promise.resolve(false);
      const [claim] = claims.splice(index, 1);
      accounts.set(claim.deviceKey, (accounts.get(claim.deviceKey) ?? 0) + 1);
      return Promise.resolve(true);
    },
    useAllowance: (address) => Promise.resolve(allowances.delete(address)),
  };
  return { accounts, allowances, store };
}

/** Why the step was refused, or null when it went through. */
export async function refusal(
  step: () => Promise<unknown>,
): Promise<DeviceRefusal | null> {
  try {
    await step();
    return null;
  } catch (error) {
    if (error instanceof DeviceRefused) return error.code;
    throw error;
  }
}

/** A whole sign-up, start to account: null, or why it was refused. */
export async function signUp(
  store: SignUpDeviceStore,
  fetcher: typeof fetch,
  attempt: SignUpAttempt,
  config: DeviceCheckConfig = CONFIG,
) {
  const started = await refusal(() =>
    checkSignUpDevice(store, config, attempt, fetcher),
  );
  if (started !== null) return started;
  return refusal(() => finishSignUpDevice(store, config, attempt, fetcher));
}

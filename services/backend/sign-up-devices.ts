// How many accounts one phone can sign up (convex/auth.ts asks, and
// convex/signUpDevices.ts keeps the state). Each platform's own check says
// which phone is asking, so reinstalling the app or clearing its data
// doesn't start over:
//
// - iPhone: Apple's DeviceCheck (sign-up-devices-apple.ts).
// - Android: Google Play Integrity and the Android ID
//   (sign-up-devices-android.ts).
//
// Simulators, emulators, and dev builds can't pass either check, so dev
// deployments (DEV_TOOLS) don't ask unless SIGN_UP_DEVICE_CHECK says to,
// and an operator can let one username past (signUpDevices:allow).

import type { DeviceCheckConfig } from "./sign-up-devices-core.ts";
import { androidDevice } from "./sign-up-devices-android.ts";
import {
  appleDevice,
  MAX_APPLE_COUNT,
  recordAppleSignUp,
} from "./sign-up-devices-apple.ts";
import { DeviceRefused, field, text } from "./sign-up-devices-core.ts";

export type {
  DeviceCheckConfig,
  DeviceRefusal,
} from "./sign-up-devices-core.ts";
export { DeviceRefused } from "./sign-up-devices-core.ts";

/** What the app sends with a sign-up, from its device-proof module. */
export type DeviceProof =
  | {
      readonly platform: "android";
      readonly androidId: string;
      readonly token: string;
    }
  | { readonly platform: "ios"; readonly token: string };

type Environment = Readonly<Record<string, string | undefined>>;

function appleSettings(env: Environment) {
  const keyId = env.DEVICECHECK_KEY_ID;
  const privateKey = env.DEVICECHECK_PRIVATE_KEY;
  const teamId = env.APPLE_TEAM_ID;
  return keyId && privateKey && teamId ? { keyId, privateKey, teamId } : null;
}

function googleSettings(env: Environment) {
  let account: unknown = null;
  try {
    account = JSON.parse(env.PLAY_INTEGRITY_SERVICE_ACCOUNT ?? "null");
  } catch {
    return null;
  }
  const clientEmail = text(account, "client_email");
  const privateKey = text(account, "private_key");
  if (clientEmail === undefined || privateKey === undefined) return null;
  return {
    packageName: env.PLAY_INTEGRITY_PACKAGE ?? "chat.vera.app",
    serviceAccount: { clientEmail, privateKey },
  };
}

/**
 * The deployment's settings. `SIGN_UP_DEVICE_CHECK` is `required` or `off`;
 * unset (or anything else), it's off on dev deployments (DEV_TOOLS=true)
 * and required everywhere else, so production is never left open by a
 * missing setting. `SIGN_UPS_PER_DEVICE` is 1 to 3 (Apple's two bits).
 */
export function deviceCheckConfig(env: Environment): DeviceCheckConfig {
  const mode = env.SIGN_UP_DEVICE_CHECK?.trim();
  const limit = Number(env.SIGN_UPS_PER_DEVICE ?? "1");
  return {
    apple: appleSettings(env),
    google: googleSettings(env),
    limit: Number.isInteger(limit)
      ? Math.min(Math.max(limit, 1), MAX_APPLE_COUNT)
      : 1,
    required:
      mode === "required" || (mode !== "off" && env.DEV_TOOLS !== "true"),
  };
}

/** The proof in a sign-up's context, or null when it has none or it's malformed. */
export function parseDeviceProof(value: unknown): DeviceProof | null {
  const token = text(value, "token");
  if (token === undefined || token.length === 0 || token.length > 8192) {
    return null;
  }
  const platform = field(value, "platform");
  if (platform === "ios") return { platform, token };
  const androidId = text(value, "androidId");
  if (platform !== "android" || androidId === undefined) return null;
  return /^[0-9a-f]{1,64}$/i.test(androidId)
    ? { androidId: androidId.toLowerCase(), platform, token }
    : null;
}

/** Where the PDS keeps allowances and Android counts (convex/signUpDevices.ts). */
export interface SignUpDeviceStore {
  /** Whether an operator let this address past the limit. */
  readonly allowed: (address: string) => Promise<boolean>;
  /** Uses up the address's allowance: whether it had one. */
  readonly useAllowance: (address: string) => Promise<boolean>;
  /** Holds one of the Android phone's sign-ups: false when it has no room. */
  readonly claim: (
    address: string,
    deviceKey: string,
    limit: number,
  ) => Promise<boolean>;
  /** Counts the address's claim as an account: false when it has none. */
  readonly finish: (address: string) => Promise<boolean>;
  /**
   * Takes the PDS's one iPhone sign-up slot for a while: false when another
   * sign-up holds it. Apple can't check and set a phone's bits in one step,
   * so iPhone sign-ups finish one at a time.
   */
  readonly lock: () => Promise<boolean>;
  readonly unlock: () => Promise<void>;
}

export interface SignUpAttempt {
  readonly address: string;
  readonly device: DeviceProof | null;
  /** As the app sent it, which an Android proof is tied to. */
  readonly username: string;
}

/** Whether an Android phone has room for one more sign-up. */
export function hasRoom(input: {
  readonly accounts: number;
  readonly address: string;
  readonly claims: readonly { address: string; expiresAt: number }[];
  readonly limit: number;
  readonly now: number;
}) {
  const pending = input.claims.filter(
    (claim) => claim.expiresAt > input.now && claim.address !== input.address,
  ).length;
  return input.accounts + pending < input.limit;
}

function requireProof(device: DeviceProof | null) {
  if (device === null) throw new DeviceRefused("DEVICE_PROOF_REQUIRED");
  return device;
}

/**
 * When a sign-up starts, before its passkey is made: refuses a phone that
 * already has its accounts, so it never gets a passkey for nothing.
 */
export async function checkSignUpDevice(
  store: SignUpDeviceStore,
  config: DeviceCheckConfig,
  signUp: SignUpAttempt,
  fetcher: typeof fetch = fetch,
) {
  if (!config.required || (await store.allowed(signUp.address))) return;
  const device = requireProof(signUp.device);
  if (device.platform === "ios") {
    const { count } = await appleDevice(config, device.token, fetcher);
    if (count >= config.limit) throw new DeviceRefused("DEVICE_LIMIT");
    return;
  }
  const deviceKey = await androidDevice(
    config,
    device,
    signUp.username,
    fetcher,
  );
  if (!(await store.claim(signUp.address, deviceKey, config.limit))) {
    throw new DeviceRefused("DEVICE_LIMIT");
  }
}

/** How often, and how long apart, an iPhone sign-up tries for the slot. */
const LOCK_TRIES = 20;
const LOCK_WAIT_MS = 500;

async function takeSlot(store: SignUpDeviceStore) {
  for (let attempt = 0; attempt < LOCK_TRIES; attempt += 1) {
    if (await store.lock()) return;
    await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_MS));
  }
  throw new DeviceRefused("DEVICE_CHECK_UNAVAILABLE", "sign-ups are busy");
}

/**
 * Counts an iPhone's sign-up at Apple, holding the slot so two sign-ups
 * from one phone at once can't both see it empty.
 */
async function countAtApple(
  store: SignUpDeviceStore,
  config: DeviceCheckConfig,
  token: string,
  fetcher: typeof fetch,
) {
  await takeSlot(store);
  try {
    const apple = await appleDevice(config, token, fetcher);
    if (apple.count >= config.limit) throw new DeviceRefused("DEVICE_LIMIT");
    await recordAppleSignUp(config, token, apple, fetcher);
  } finally {
    await store.unlock();
  }
}

/**
 * When the passkey is made, just before the account is: counts the sign-up
 * against its phone, or refuses it. (If creating the account fails after
 * this, the phone has used a sign-up; that's rare and errs on the safe
 * side.)
 */
export async function finishSignUpDevice(
  store: SignUpDeviceStore,
  config: DeviceCheckConfig,
  signUp: SignUpAttempt,
  fetcher: typeof fetch = fetch,
) {
  if (!config.required || (await store.useAllowance(signUp.address))) return;
  const device = requireProof(signUp.device);
  if (device.platform === "ios") {
    await countAtApple(store, config, device.token, fetcher);
    return;
  }
  // The start checked this phone with Google and left a claim.
  if (!(await store.finish(signUp.address))) {
    throw new DeviceRefused(
      "DEVICE_PROOF_INVALID",
      "no claim for this sign-up",
    );
  }
}

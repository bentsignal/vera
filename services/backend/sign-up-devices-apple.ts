// iPhone: Apple's DeviceCheck (sign-up-devices.ts). Apple keeps two bits
// per phone for Vera, which survive reinstalls; they count the phone's
// sign-ups, 0 to 3.

import type {
  AppleSettings,
  DeviceCheckConfig,
} from "./sign-up-devices-core.ts";
import { DeviceRefused, field, signJwt } from "./sign-up-devices-core.ts";

/** The most a phone's two bits can count. */
export const MAX_APPLE_COUNT = 3;

const HOSTS = [
  "https://api.devicecheck.apple.com",
  // Development-signed builds' tokens; production refuses them.
  "https://api.development.devicecheck.apple.com",
] as const;

/** A phone's state at Apple: its sign-up count, and which host knows it. */
export interface AppleDevice {
  readonly count: number;
  readonly host: string;
}

function requireApple(config: DeviceCheckConfig) {
  if (config.apple === null) {
    throw new DeviceRefused(
      "DEVICE_CHECK_UNAVAILABLE",
      "DeviceCheck isn't configured",
    );
  }
  return config.apple;
}

async function call(
  apple: AppleSettings,
  fetcher: typeof fetch,
  url: string,
  body: Record<string, unknown>,
) {
  const jwt = await signJwt(
    { kid: apple.keyId },
    { iat: Math.floor(Date.now() / 1000), iss: apple.teamId },
    apple.privateKey,
    "ES256",
  );
  const response = await fetcher(url, {
    body: JSON.stringify({
      ...body,
      timestamp: Date.now(),
      transaction_id: crypto.randomUUID(),
    }),
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  return {
    ok: response.ok,
    status: response.status,
    text: await response.text(),
  };
}

/** The count in a query's answer, or null when the host refused the token. */
function countOf(answer: { ok: boolean; status: number; text: string }) {
  // A phone Vera never set bits for answers in plain text (some report it
  // with an error status).
  if (/failed to find bit state/i.test(answer.text)) return 0;
  if (answer.ok) {
    const bits: unknown = JSON.parse(answer.text);
    return (
      (field(bits, "bit0") === true ? 1 : 0) +
      (field(bits, "bit1") === true ? 2 : 0)
    );
  }
  if (answer.status === 400 && /bad device token/i.test(answer.text)) {
    return null;
  }
  throw new DeviceRefused(
    "DEVICE_CHECK_UNAVAILABLE",
    `DeviceCheck ${answer.status} ${answer.text.slice(0, 200)}`,
  );
}

/** How many accounts this iPhone has signed up, per Apple. */
export async function appleDevice(
  config: DeviceCheckConfig,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<AppleDevice> {
  const apple = requireApple(config);
  for (const host of HOSTS) {
    const count = countOf(
      await call(apple, fetcher, `${host}/v1/query_two_bits`, {
        device_token: token,
      }),
    );
    if (count !== null) return { count, host };
  }
  throw new DeviceRefused(
    "DEVICE_PROOF_INVALID",
    "DeviceCheck rejected the token",
  );
}

/** Counts one more sign-up on this iPhone, at Apple. */
export async function recordAppleSignUp(
  config: DeviceCheckConfig,
  token: string,
  device: AppleDevice,
  fetcher: typeof fetch = fetch,
) {
  const count = Math.min(device.count + 1, MAX_APPLE_COUNT);
  const answer = await call(
    requireApple(config),
    fetcher,
    `${device.host}/v1/update_two_bits`,
    { bit0: (count & 1) === 1, bit1: (count & 2) === 2, device_token: token },
  );
  if (!answer.ok) {
    throw new DeviceRefused(
      "DEVICE_CHECK_UNAVAILABLE",
      `DeviceCheck update ${answer.status} ${answer.text.slice(0, 200)}`,
    );
  }
}

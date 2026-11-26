// What sign-up-devices.ts and its Apple and Google halves share: the
// settings, the refusal, and the small bits of crypto both checks need.

/** Why a sign-up's device was refused, as the app's error code. */
export type DeviceRefusal =
  /** No proof (an app without the module, a simulator, an emulator). */
  | "DEVICE_PROOF_REQUIRED"
  /** The proof didn't check out. */
  | "DEVICE_PROOF_INVALID"
  /** This phone already has its accounts. */
  | "DEVICE_LIMIT"
  /** Apple or Google didn't answer, or the PDS isn't set up to ask. */
  | "DEVICE_CHECK_UNAVAILABLE";

export class DeviceRefused extends Error {
  readonly code: DeviceRefusal;
  constructor(code: DeviceRefusal, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.code = code;
  }
}

export interface AppleSettings {
  readonly keyId: string;
  readonly privateKey: string;
  readonly teamId: string;
}

export interface GoogleSettings {
  readonly packageName: string;
  readonly serviceAccount: {
    readonly clientEmail: string;
    readonly privateKey: string;
  };
}

export interface DeviceCheckConfig {
  /** Whether sign-ups need a device proof at all. */
  readonly required: boolean;
  /** Accounts one phone can sign up. */
  readonly limit: number;
  readonly apple: AppleSettings | null;
  readonly google: GoogleSettings | null;
}

/** A field of a parsed JSON value, or undefined. */
export function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, name)
    : undefined;
}

/** A string field, or undefined. */
export function text(value: unknown, name: string) {
  const found = field(value, name);
  return typeof found === "string" ? found : undefined;
}

export function base64url(bytes: ArrayBuffer | Uint8Array | string) {
  const data =
    typeof bytes === "string"
      ? new TextEncoder().encode(bytes)
      : new Uint8Array(bytes);
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** A PEM's DER bytes; tolerates `\n` written out, as env vars often have. */
function pemBody(pem: string) {
  const base64 = pem
    .replace(/-----(BEGIN|END) [A-Z ]+-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

/** A signed JWT: ES256 for Apple, RS256 for Google. */
export async function signJwt(
  header: Record<string, string>,
  claims: Record<string, unknown>,
  pem: string,
  algorithm: "ES256" | "RS256",
) {
  const ecdsa = algorithm === "ES256";
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBody(pem),
    ecdsa
      ? { name: "ECDSA", namedCurve: "P-256" }
      : { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["sign"],
  );
  const input = `${base64url(JSON.stringify({ ...header, alg: algorithm, typ: "JWT" }))}.${base64url(JSON.stringify(claims))}`;
  // WebCrypto's ECDSA signature is the raw r‖s that ES256 wants.
  const signature = await crypto.subtle.sign(
    ecdsa ? { hash: "SHA-256", name: "ECDSA" } : { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64url(signature)}`;
}

export async function sha256(value: string) {
  return base64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

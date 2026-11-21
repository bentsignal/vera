import { requireOptionalNativeModule } from "expo";

/**
 * What a sign-up sends so the PDS can hold each phone to its number of
 * accounts (services/backend/sign-up-devices.ts): Apple's DeviceCheck token
 * on iPhone, a Play Integrity token and the Android ID on Android.
 */
export type DeviceProof =
  | {
      readonly platform: "android";
      readonly androidId: string;
      readonly token: string;
    }
  | { readonly platform: "ios"; readonly token: string };

interface DeviceProofModule {
  signUpProofAsync: (
    username: string,
    cloudProjectNumber: string,
  ) => Promise<DeviceProof | null>;
}

// Optional, so binaries from before the module keep running. They send no
// proof, which a PDS that checks refuses with DEVICE_PROOF_REQUIRED.
const native =
  requireOptionalNativeModule<DeviceProofModule>("VeraDeviceProof");

/**
 * The Google Cloud project Play Integrity answers for: the Firebase
 * project in google-services.json, linked to Vera in Play Console.
 */
const CLOUD_PROJECT_NUMBER = "863019500780";

const PROOF_TIMEOUT_MS = 10_000;

/**
 * This phone's proof for signing up as `username`, or null where there's
 * none (an older binary, a simulator or emulator, a phone without Play).
 * The PDS decides whether it needs one.
 */
export async function signUpProof(username: string) {
  if (native === null) return null;
  const proof = native
    .signUpProofAsync(username, CLOUD_PROJECT_NUMBER)
    .catch(() => null);
  // Google can be slow to answer (seconds on an emulator); sign-up goes on
  // without a proof rather than spin, and the PDS decides.
  const giveUp = new Promise<null>((resolve) => {
    setTimeout(() => {
      resolve(null);
    }, PROOF_TIMEOUT_MS);
  });
  return Promise.race([proof, giveUp]);
}

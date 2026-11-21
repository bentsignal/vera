import type { DiscoveredPds } from "@decentralized-convex/client";
import * as SecureStore from "expo-secure-store";
import { expoClient } from "@better-auth/expo/client";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Where a sign-in in progress keeps its cookies until it becomes an account. */
export const PENDING_STORAGE_PREFIX = "vera-pending";

/** Better Auth against a home PDS, storing its session under `storagePrefix`. */
export function createHomeAuthClient(
  home: DiscoveredPds,
  storagePrefix: string,
) {
  return createAuthClient({
    baseURL: home.manifest.httpUrl,
    // Nothing in the app watches the session: queries sign in with tokens
    // (federation-auth.ts), which ask for it when they need to. Left on,
    // every account's client asked for its session each time the app came
    // to the front, and each one's answer set the others asking again
    // (they share one broadcast channel): 9 requests per wake for three
    // accounts, while the phone's network was still coming back.
    sessionOptions: { refetchOnWindowFocus: false },
    plugins: [
      convexClient(),
      // The scheme (the origin the PDS checks) comes from app.config.ts:
      // `vera`, or `vera-dev` for Vera Dev.
      expoClient({
        storage: SecureStore,
        storagePrefix,
      }),
    ],
  });
}

export type HomeAuthClient = ReturnType<typeof createHomeAuthClient>;

function storedItem(key: string) {
  try {
    return SecureStore.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Deletes an account's Better Auth session from this device: its cookie and
 * cached session, each of which may be split across several keys (Better
 * Auth's Expo storage writes long values in chunks, `<key>.0`, `<key>.1`,
 * and so on, with the count in `<key>`).
 */
export function forgetAuthStorage(storagePrefix: string) {
  for (const key of [
    `${storagePrefix}_cookie`,
    `${storagePrefix}_session_data`,
  ]) {
    const chunks = Number(
      /ba-chunks:(\d+)$/.exec(storedItem(key) ?? "")?.[1] ?? 0,
    );
    for (let index = 0; index < chunks; index += 1) {
      void SecureStore.deleteItemAsync(`${key}.${index}`).catch(() => null);
    }
    void SecureStore.deleteItemAsync(key).catch(() => null);
  }
}

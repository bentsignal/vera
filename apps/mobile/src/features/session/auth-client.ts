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
    plugins: [
      convexClient(),
      expoClient({
        scheme: "vera",
        storage: SecureStore,
        storagePrefix,
      }),
    ],
  });
}

export type HomeAuthClient = ReturnType<typeof createHomeAuthClient>;

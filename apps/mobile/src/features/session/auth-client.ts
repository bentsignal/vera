import type { DiscoveredPds } from "@decentralized-convex/client";
import * as SecureStore from "expo-secure-store";
import { expoClient } from "@better-auth/expo/client";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export function createHomeAuthClient(home: DiscoveredPds) {
  return createAuthClient({
    baseURL: home.manifest.httpUrl,
    plugins: [
      convexClient(),
      expoClient({
        scheme: "vera",
        storage: SecureStore,
        storagePrefix: `vera-${home.domain}`,
      }),
    ],
  });
}

export type HomeAuthClient = ReturnType<typeof createHomeAuthClient>;

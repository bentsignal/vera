import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export function createHomeAuthClient(siteUrl: string, storagePrefix: string) {
  return createAuthClient({
    baseURL: siteUrl,
    plugins: [convexClient(), crossDomainClient({ storagePrefix })],
  });
}

export type HomeAuthClient = ReturnType<typeof createHomeAuthClient>;

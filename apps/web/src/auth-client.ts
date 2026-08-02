import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export function createHomeAuthClient(siteUrl: string) {
  return createAuthClient({
    baseURL: siteUrl,
    plugins: [convexClient(), crossDomainClient()],
  });
}

export type HomeAuthClient = ReturnType<typeof createHomeAuthClient>;

import { ConvexHttpClient } from "convex/browser";

import { env } from "~/env";

let client: ConvexHttpClient | undefined;

export function getConvexHttpClient() {
  client ??= new ConvexHttpClient(env.VITE_CONVEX_URL);
  return client;
}

export function getAuthenticatedConvexClient(token: string | undefined) {
  const client = getConvexHttpClient();
  if (token) {
    client.setAuth(token);
  }
  return client;
}

import type { FederationAuthTokenFetcher } from "@decentralized-convex/client";

import type { HomeAuthClient } from "./auth-client.ts";
import type { HomeServer } from "./live/config.ts";

interface FederationAuthOptions {
  authClient: HomeAuthClient;
  home: HomeServer;
  homes: readonly HomeServer[];
}

interface CachedToken {
  expiresAt: number;
  token: string;
}

export function createFederationAuthTokenFetcher({
  authClient,
  home,
  homes,
}: FederationAuthOptions): FederationAuthTokenFetcher {
  const cache = new Map<string, CachedToken>();
  const homesByUrl = new Map(homes.map((server) => [server.convexUrl, server]));

  return async ({ forceRefreshToken, url }) => {
    if (url === home.convexUrl) {
      return getHomeToken(authClient);
    }

    const target = homesByUrl.get(url);
    if (target === undefined) return null;
    return getRemoteToken({
      authClient,
      cache,
      forceRefreshToken,
      home,
      target,
      url,
    });
  };
}

async function getHomeToken(authClient: HomeAuthClient) {
  const token = await authClient.convex.token({
    fetchOptions: { throw: false },
  });
  return token.data?.token ?? null;
}

async function getRemoteToken({
  authClient,
  cache,
  forceRefreshToken,
  home,
  target,
  url,
}: {
  authClient: HomeAuthClient;
  cache: Map<string, CachedToken>;
  forceRefreshToken: boolean;
  home: HomeServer;
  target: HomeServer;
  url: string;
}) {
  const cached = cache.get(url);
  if (
    !forceRefreshToken &&
    cached !== undefined &&
    cached.expiresAt > Date.now() / 1_000 + 30
  ) {
    return cached.token;
  }

  const session = await authClient.getSession();
  const sessionToken = session.data?.session.token;
  if (sessionToken === undefined) return null;
  const assertionResponse = await postJson(
    `${home.siteUrl}/api/auth/federation/assertion`,
    { audience: target.domain },
    { authorization: `Bearer ${sessionToken}` },
  );
  if (!assertionResponse.ok) {
    throw new Error(
      `Home PDS could not create an identity proof (${assertionResponse.status})`,
    );
  }
  const assertionPayload = await readJson(assertionResponse);
  const assertion = requireString(
    readProperty(assertionPayload, "assertion"),
    "assertion",
  );
  const exchangeResponse = await postJson(
    `${target.siteUrl}/api/auth/federation/exchange`,
    { assertion },
  );
  if (!exchangeResponse.ok) {
    throw new Error(
      `Remote PDS rejected the identity proof (${exchangeResponse.status})`,
    );
  }
  const exchange = await readJson(exchangeResponse);
  const result = {
    expiresAt: requireNumber(readProperty(exchange, "expiresAt"), "expiresAt"),
    token: requireString(readProperty(exchange, "token"), "token"),
  };
  cache.set(url, result);
  return result.token;
}

function postJson(
  url: string,
  body: object,
  headers: Readonly<Record<string, string>> = {},
) {
  return fetch(url, {
    body: JSON.stringify(body),
    headers: { ...headers, "content-type": "application/json" },
    method: "POST",
  });
}

async function readJson(response: Response): Promise<unknown> {
  // The DOM library types Response.json() as `any`; treat the untrusted payload as unknown.
  return response.json();
}

function readProperty(value: unknown, field: string): unknown {
  if (typeof value !== "object" || value === null) {
    throw new Error("PDS authentication returned an invalid response");
  }
  return Reflect.get(value, field);
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`PDS authentication response is missing ${field}`);
  }
  return value;
}

function requireNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`PDS authentication response is missing ${field}`);
  }
  return value;
}

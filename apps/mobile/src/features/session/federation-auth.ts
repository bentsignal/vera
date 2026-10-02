import type {
  DiscoveredPds,
  FederationAuthTokenFetcher,
} from "@decentralized-convex/client";

import type { HomeAuthClient } from "./auth-client";

interface CachedToken {
  readonly expiresAt: number;
  readonly token: string;
}

function assertionOf(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "assertion" in value &&
    typeof value.assertion === "string"
  ) {
    return value.assertion;
  }
  throw new Error("Home PDS returned an invalid identity proof");
}

function exchangeOf(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "expiresAt" in value &&
    "token" in value &&
    typeof value.expiresAt === "number" &&
    typeof value.token === "string"
  ) {
    return { expiresAt: value.expiresAt, token: value.token };
  }
  throw new Error("Remote PDS returned an invalid token");
}

async function postJson(
  url: string,
  body: object,
  headers: Readonly<Record<string, string>> = {},
) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { ...headers, "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`PDS authentication failed (${response.status})`);
  }
  return response;
}

async function exchangeToken(
  authClient: HomeAuthClient,
  home: DiscoveredPds,
  target: DiscoveredPds,
) {
  const session = await authClient.getSession();
  const sessionToken = session.data?.session.token;
  if (sessionToken === undefined) return null;
  const proof = await postJson(
    `${home.manifest.httpUrl}/api/auth/federation/assertion`,
    { audience: target.domain },
    { authorization: `Bearer ${sessionToken}` },
  );
  const assertion = assertionOf(await proof.json());
  const exchange = await postJson(
    `${target.manifest.httpUrl}/api/auth/federation/exchange`,
    { assertion },
  );
  return exchangeOf(await exchange.json());
}

async function homeToken(authClient: HomeAuthClient) {
  const { data } = await authClient.convex.token({
    fetchOptions: { throw: false },
  });
  return data?.token ?? null;
}

/**
 * Uses the Better Auth session for the home PDS, and exchanges a short-lived
 * home assertion for a token on any other PDS a query reaches.
 */
export function createFederationAuthTokenFetcher(
  authClient: HomeAuthClient,
  home: DiscoveredPds,
) {
  const cache = new Map<string, CachedToken>();

  function cached(url: string, forceRefreshToken: boolean) {
    const entry = cache.get(url);
    if (forceRefreshToken || entry === undefined) return null;
    return entry.expiresAt > Date.now() / 1_000 + 30 ? entry.token : null;
  }

  async function fetchToken({
    forceRefreshToken,
    pds,
    url,
  }: Parameters<FederationAuthTokenFetcher>[0]) {
    if (url === home.manifest.deploymentUrl) return homeToken(authClient);
    if (pds === undefined) return null;
    const reused = cached(url, forceRefreshToken);
    if (reused !== null) return reused;
    const token = await exchangeToken(authClient, home, pds);
    if (token !== null) cache.set(url, token);
    return token?.token ?? null;
  }
  return fetchToken;
}

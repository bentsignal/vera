import type {
  DiscoveredPds,
  FederationAuthTokenFetcher,
} from "@decentralized-convex/client";
import * as SecureStore from "expo-secure-store";

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

/** How long to wait before each new try of a failed token request. */
const TOKEN_RETRY_MS = [500, 1_500, 3_000];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Whether a failed token request might work if tried again: no answer
 * (no network yet, as a phone wakes) or the PDS failing, not the PDS
 * saying the session is gone.
 */
function worthRetrying(status: number | undefined) {
  return status === undefined || status === 0 || status >= 500;
}

/**
 * A new home token, or null once the session is gone. A request that gets
 * no answer is tried again a few times first: null tells Convex's client
 * the account is signed out, and it stops asking (#343).
 */
export async function homeToken(authClient: HomeAuthClient) {
  for (let attempt = 0; ; attempt += 1) {
    let status: number | undefined;
    try {
      const { data, error } = await authClient.convex.token({
        fetchOptions: { throw: false },
      });
      if (typeof data?.token === "string") return data.token;
      status = error?.status;
    } catch {
      status = undefined;
    }
    const delay = TOKEN_RETRY_MS[attempt];
    if (delay === undefined || !worthRetrying(status)) return null;
    await wait(delay);
  }
}

function expiryIn(payload: unknown) {
  return typeof payload === "object" &&
    payload !== null &&
    "exp" in payload &&
    typeof payload.exp === "number"
    ? payload.exp
    : 0;
}

/** When a JWT expires, in seconds since the epoch; 0 if it can't be read. */
function expiryOf(token: string) {
  try {
    const encoded = (token.split(".")[1] ?? "")
      .replaceAll("-", "+")
      .replaceAll("_", "/");
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    return expiryIn(JSON.parse(atob(padded)));
  } catch {
    return 0;
  }
}

/** Where an account keeps its last home token (see `savedHomeToken`). */
function homeTokenKey(storagePrefix: string) {
  return `${storagePrefix}_home_token`;
}

/** Forgets an account's saved home token, as it signs out. */
export function forgetHomeToken(storagePrefix: string) {
  void SecureStore.deleteItemAsync(homeTokenKey(storagePrefix)).catch(
    () => null,
  );
}

/**
 * Uses the Better Auth session for the home PDS, and exchanges a short-lived
 * home assertion for a token on any other PDS a query reaches.
 *
 * The home token is saved, so the app's first queries go out with it
 * rather than waiting for a new one: the connection doesn't send anything
 * until it has a token. One that has expired (or that the PDS turns down,
 * which asks again with `forceRefreshToken`) is replaced.
 */
export function createFederationAuthTokenFetcher(
  authClient: HomeAuthClient,
  home: DiscoveredPds,
  storagePrefix: string,
) {
  const cache = new Map<string, CachedToken>();
  const key = homeTokenKey(storagePrefix);
  let current = SecureStore.getItem(key);
  /** The home token the connection was last given (at first, the saved one). */
  let given = current;
  /** The one request for a new home token, while it's on its way. */
  let requesting: Promise<string | null> | undefined;

  function freshFor(token: string | null, seconds: number) {
    return token !== null && expiryOf(token) > Date.now() / 1_000 + seconds;
  }

  /** A new home token, from the one request everything asking shares. */
  function requestHomeToken() {
    requesting ??= homeToken(authClient)
      .then((token) => {
        if (token !== null) {
          current = token;
          // Saved without waiting. A failed request (offline, say) leaves
          // the last one, which lapses on its own or goes on sign-out.
          void SecureStore.setItemAsync(key, token).catch(() => null);
        }
        return token;
      })
      .finally(() => {
        requesting = undefined;
      });
    return requesting;
  }

  async function savedHomeToken(forceRefreshToken: boolean) {
    if (requesting !== undefined) return requesting;
    // Turned down: a newer one the connection hasn't had yet (fetched as
    // the app woke) is the answer; otherwise ask for one.
    const usable =
      freshFor(current, 60) && (!forceRefreshToken || current !== given);
    return usable ? current : requestHomeToken();
  }

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
    if (url === home.manifest.deploymentUrl) {
      given = await savedHomeToken(forceRefreshToken);
      return given;
    }
    if (pds === undefined) return null;
    const reused = cached(url, forceRefreshToken);
    if (reused !== null) return reused;
    const token = await exchangeToken(authClient, home, pds);
    if (token !== null) cache.set(url, token);
    return token?.token ?? null;
  }

  return {
    fetchToken,
    /** The home token, shared with the connection's (for HTTP calls). */
    homeToken: () => savedHomeToken(false),
    /**
     * Whether the connection should sign in again: the token it has
     * doesn't last another `seconds`. Signing in takes the newest token
     * held if it's fresh, and otherwise asks for one and holds the
     * connection back until it comes.
     */
    needsSignIn: (seconds: number) => !freshFor(given, seconds),
    /** Gets a new home token now if the one held expires within `seconds`. */
    async refreshWithin(seconds: number) {
      if (!freshFor(current, seconds)) await requestHomeToken();
    },
  };
}

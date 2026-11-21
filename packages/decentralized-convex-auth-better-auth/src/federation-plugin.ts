import type { BetterAuthPlugin, GenericEndpointContext } from "better-auth";
import type { Jwk, JwtOptions } from "better-auth/plugins/jwt";
import {
  discoverPds,
  fetchPublic,
  isAddress,
} from "@decentralized-convex/address";
import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { signJWT } from "better-auth/plugins/jwt";
import { createRemoteJWKSet, customFetch, decodeJwt, jwtVerify } from "jose";
import { z } from "zod";

import type { BetterAuthPdsRuntimeConfig } from "./adapter.ts";
import { acceptOnce } from "./accepted-assertions.ts";

/** A signing key as the Convex adapter returns it, with numbers for dates. */
type StoredJwk = Omit<Jwk, "createdAt" | "expiresAt"> & {
  createdAt: Date | number;
  expiresAt?: Date | number;
};

/**
 * Better Auth sorts signing keys by `createdAt.getTime()`, but the Convex
 * adapter returns dates as numbers, so signing failed once a PDS had more
 * than one key. This reads them back as dates, as the Convex plugin does.
 */
export const convexJwks = {
  createJwk: (webKey, ctx) =>
    ctx.context.adapter.create({
      data: { ...webKey, createdAt: new Date() },
      model: "jwks",
    }),
  getJwks: async (ctx) => {
    const keys = await ctx.context.adapter.findMany<StoredJwk>({
      model: "jwks",
      sortBy: { direction: "desc", field: "createdAt" },
    });
    return keys.map(({ createdAt, expiresAt, ...key }) => ({
      ...key,
      createdAt: new Date(createdAt),
      ...(expiresAt === undefined ? {} : { expiresAt: new Date(expiresAt) }),
    }));
  },
} satisfies JwtOptions["adapter"];

const assertionBody = z.object({ audience: z.string().min(1) });
const exchangeBody = z.object({ assertion: z.string().min(1) });

export function createFederationPlugin(
  options: BetterAuthPdsRuntimeConfig,
): BetterAuthPlugin {
  const accountDomain = normalizeDomain(options.accountDomain);
  const jwtOptions = {
    adapter: convexJwks,
    jwt: {
      audience: "convex",
      expirationTime: "15m",
      issuer: options.issuer,
    },
    jwks: { keyPairConfig: { alg: "EdDSA" } },
  } satisfies JwtOptions;

  return {
    endpoints: {
      createFederationAssertion: createAuthEndpoint(
        "/federation/assertion",
        { body: assertionBody, method: "POST", use: [sessionMiddleware] },
        async (ctx) => {
          const audience = normalizeDomain(ctx.body.audience);
          const user = ctx.context.session.user;
          const accountId = options.getAccountId({
            email: user.email,
            id: user.id,
            name: user.name,
          });
          if (accountDomainFromId(accountId) !== accountDomain) {
            throw new Error(
              `Authenticated account ${accountId} does not belong to ${accountDomain}`,
            );
          }
          const issuedAt = nowInSeconds();
          const assertion = await signJWT(ctx, {
            options: {
              ...jwtOptions,
              jwt: {
                ...jwtOptions.jwt,
                audience,
                expirationTime: "5m",
              },
            },
            payload: {
              accountId,
              aud: audience,
              home: accountDomain,
              iat: issuedAt,
              jti: crypto.randomUUID(),
              name: user.name,
              purpose: "pds-federation",
              sub: user.id,
            },
          });
          return { assertion };
        },
      ),
      exchangeFederationAssertion: createAuthEndpoint(
        "/federation/exchange",
        { body: exchangeBody, method: "POST" },
        async (ctx) => {
          const { accountId, auth, homeDomain, payload } =
            await acceptedAssertion(ctx, ctx.body.assertion, accountDomain);
          const issuedAt = nowInSeconds();
          const expiresAt = issuedAt + 15 * 60;
          const token = await signJWT(ctx, {
            options: jwtOptions,
            payload: {
              accountId,
              aud: "convex",
              email: accountId,
              exp: expiresAt,
              federated: true,
              home: homeDomain,
              iat: issuedAt,
              jti: crypto.randomUUID(),
              name:
                typeof payload.name === "string"
                  ? payload.name
                  : accountId.split("@")[0],
              originalIssuer: auth.issuer,
              sub: accountId,
            },
          });
          return { accountId, expiresAt, token };
        },
      ),
    },
    id: "decentralized-convex-federation-auth",
  } satisfies BetterAuthPlugin;
}

/**
 * The exchange's assertion, verified (`verifyAssertion`) and not used
 * before (`acceptOnce`), or an UNAUTHORIZED error.
 */
async function acceptedAssertion(
  ctx: GenericEndpointContext,
  assertion: string,
  accountDomain: string,
) {
  let verified: VerifiedAssertion;
  try {
    verified = await verifyAssertion(assertion, accountDomain);
  } catch {
    throw ctx.error("UNAUTHORIZED", {
      message: "Invalid federation assertion",
    });
  }
  // Each assertion signs in once: a copy of one used before is refused
  // until it expires.
  if (!(await acceptOnce(ctx.context.adapter, verified))) {
    throw ctx.error("UNAUTHORIZED", {
      message: "Federation assertion already used",
    });
  }
  return verified;
}

export interface VerifiedAssertion {
  accountId: string;
  auth: { issuer: string; jwksUrl: string };
  /** When the assertion stops being accepted, in seconds. */
  expiresAt: number;
  homeDomain: string;
  /** The assertion's own ID (`jti`). */
  id: string;
  payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
}

/** The longest an assertion may be good for (they're made for 5 minutes). */
const MAX_ASSERTION_LIFETIME_S = 10 * 60;

export interface VerifyAssertionOptions {
  /** The fetch for another server's manifest and keys (tests). */
  readonly fetch?: typeof fetch;
}

/**
 * Checks an assertion from another PDS: its account address is in the
 * protocol's format, it's signed by the key its home domain publishes, and
 * it's for this PDS, short-lived and has an ID. The manifest and key file
 * are fetched only from the public web, each redirect checked first.
 */
export async function verifyAssertion(
  assertion: string,
  audience: string,
  options: VerifyAssertionOptions = {},
): Promise<VerifiedAssertion> {
  const unverified = decodeJwt(assertion);
  const accountId = requireAddress(unverified.accountId);
  const homeDomain = accountDomainFromId(accountId);
  if (unverified.purpose !== "pds-federation") {
    throw new Error("Invalid federation assertion purpose");
  }
  const fetcher = options.fetch ?? fetch;
  const discovery = await discoverPds(homeDomain, {
    fetch: fetcher,
    publicOnly: true,
  });
  const auth = discovery.manifest.auth;
  if (auth === undefined) {
    throw new Error("The home PDS does not advertise authentication");
  }
  const verified = await jwtVerify(
    assertion,
    createRemoteJWKSet(new URL(auth.jwksUrl), {
      [customFetch]: (url: string, init: RequestInit) =>
        fetchPublic(url, init, { fetch: fetcher, httpsOnly: true }),
    }),
    { audience, issuer: auth.issuer, requiredClaims: ["exp", "jti"] },
  );
  requireSameIdentity(verified.payload, accountId, homeDomain);
  const { expiresAt, id } = requireShortLivedId(verified.payload);
  return {
    accountId,
    auth,
    expiresAt,
    homeDomain,
    id,
    payload: verified.payload,
  };
}

/** The signed claims name the same account and home as were looked up. */
function requireSameIdentity(
  payload: VerifiedAssertion["payload"],
  accountId: string,
  homeDomain: string,
) {
  if (
    requireAddress(payload.accountId) !== accountId ||
    payload.home !== homeDomain ||
    payload.purpose !== "pds-federation"
  ) {
    throw new Error("Federation identity does not match its home PDS");
  }
}

/** An assertion's ID and expiry, which must be soon. */
function requireShortLivedId(payload: VerifiedAssertion["payload"]) {
  const { exp, jti } = payload;
  if (
    exp === undefined ||
    exp > nowInSeconds() + MAX_ASSERTION_LIFETIME_S ||
    jti === undefined ||
    jti.length === 0 ||
    jti.length > 200
  ) {
    throw new Error("Federation assertion must be short-lived and have an ID");
  }
  return { expiresAt: exp, id: jti };
}

/** An address claim, which must already be in the protocol's format. */
function requireAddress(value: unknown) {
  const address = requireClaim(value, "accountId");
  if (!isAddress(address)) throw new Error("Invalid federated account ID");
  return address;
}

function accountDomainFromId(accountId: string) {
  const separator = accountId.lastIndexOf("@");
  if (separator < 1) throw new Error("Invalid federated account ID");
  return normalizeDomain(accountId.slice(separator + 1));
}

function normalizeDomain(value: string) {
  const domain = value.trim().toLowerCase();
  if (
    !domain.includes(".") ||
    !domain
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
  ) {
    throw new Error("Invalid PDS account domain");
  }
  return domain;
}

function requireClaim(value: unknown, name: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`PDS authentication assertion is missing ${name}`);
  }
  return value;
}

function nowInSeconds() {
  return Math.floor(Date.now() / 1_000);
}

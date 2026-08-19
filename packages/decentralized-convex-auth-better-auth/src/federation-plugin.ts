import type { BetterAuthPlugin } from "better-auth";
import type { JwtOptions } from "better-auth/plugins/jwt";
import { discoverPds } from "@decentralized-convex/address";
import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { signJWT } from "better-auth/plugins/jwt";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import { z } from "zod";

import type { BetterAuthPdsRuntimeConfig } from "./adapter.ts";

const assertionBody = z.object({ audience: z.string().min(1) });
const exchangeBody = z.object({ assertion: z.string().min(1) });

export function createFederationPlugin(
  options: BetterAuthPdsRuntimeConfig,
): BetterAuthPlugin {
  const accountDomain = normalizeDomain(options.accountDomain);
  const jwtOptions = {
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
          let verifiedAssertion: VerifiedAssertion;
          try {
            verifiedAssertion = await verifyAssertion(
              ctx.body.assertion,
              accountDomain,
            );
          } catch {
            throw ctx.error("UNAUTHORIZED", {
              message: "Invalid federation assertion",
            });
          }
          const { accountId, auth, homeDomain, payload } = verifiedAssertion;
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

interface VerifiedAssertion {
  accountId: string;
  auth: { issuer: string; jwksUrl: string };
  homeDomain: string;
  payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
}

async function verifyAssertion(
  assertion: string,
  audience: string,
): Promise<VerifiedAssertion> {
  const unverified = decodeJwt(assertion);
  const accountId = requireClaim(unverified.accountId, "accountId");
  const homeDomain = accountDomainFromId(accountId);
  if (unverified.purpose !== "pds-federation") {
    throw new Error("Invalid federation assertion purpose");
  }
  const discovery = await discoverPds(homeDomain);
  const auth = discovery.manifest.auth;
  if (auth === undefined) {
    throw new Error("The home PDS does not advertise authentication");
  }
  const verified = await jwtVerify(
    assertion,
    createRemoteJWKSet(new URL(auth.jwksUrl)),
    { audience, issuer: auth.issuer },
  );
  if (
    verified.payload.accountId !== accountId ||
    verified.payload.home !== homeDomain ||
    verified.payload.purpose !== "pds-federation"
  ) {
    throw new Error("Federation identity does not match its home PDS");
  }
  return { accountId, auth, homeDomain, payload: verified.payload };
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

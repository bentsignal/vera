import type { PdsAuthAdapter } from "@decentralized-convex/server";

type ResolvableString = string | (() => string);

export const betterAuthRuntimeConfig = Symbol("betterAuthRuntimeConfig");

export interface BetterAuthPdsUser {
  readonly email: string;
  readonly id: string;
  readonly name: string;
}

export interface BetterAuthPdsAdapterOptions {
  readonly accountDomain: ResolvableString;
  readonly component: NonNullable<PdsAuthAdapter["component"]>;
  readonly getAccountId?: (user: BetterAuthPdsUser) => string;
  readonly issuer: ResolvableString;
  readonly jwksUrl?: ResolvableString;
}

export interface BetterAuthPdsAdapter extends PdsAuthAdapter {
  readonly [betterAuthRuntimeConfig]: () => BetterAuthPdsRuntimeConfig;
}

export interface BetterAuthPdsRuntimeConfig {
  readonly accountDomain: string;
  readonly getAccountId: (user: BetterAuthPdsUser) => string;
  readonly issuer: string;
}

/**
 * Adds the public PDS auth protocol around an otherwise normal Better Auth
 * configuration. It does not own the host's database, providers, sessions,
 * callbacks, or UI.
 */
export function betterAuthAdapter(
  options: BetterAuthPdsAdapterOptions,
): BetterAuthPdsAdapter {
  return {
    component: options.component,
    descriptor: () => {
      const issuer = resolve(options.issuer);
      return {
        issuer,
        jwksUrl:
          options.jwksUrl === undefined
            ? new URL("/api/auth/convex/jwks", issuer).toString()
            : resolve(options.jwksUrl),
      };
    },
    [betterAuthRuntimeConfig]: () => ({
      accountDomain: resolve(options.accountDomain),
      getAccountId: options.getAccountId ?? ((user) => user.email),
      issuer: resolve(options.issuer),
    }),
  };
}

function resolve(value: ResolvableString) {
  return typeof value === "function" ? value() : value;
}

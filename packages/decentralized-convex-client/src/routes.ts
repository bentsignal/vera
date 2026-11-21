import type { DiscoveredPds } from "@decentralized-convex/address";
import { accountDomain } from "@decentralized-convex/address";

import type { AnyPdsQueryRequest } from "./pds.ts";
import type { FederationSourceSnapshot, FederationTarget } from "./types.ts";
import { assertPdsSupportsRequest } from "./compatibility.ts";
import { toError } from "./errors.ts";
import {
  groupFederationTargets,
  normalizeFederationUrl,
  pdsTarget,
} from "./targets.ts";

/** How long a failed PDS lookup stands before the domain is looked up again. */
const FAILED_LOOKUP_REUSE_MS = 30_000;

/**
 * A route's PDS, or, with `error`, why it can't be asked: its domain has no
 * PDS that can be found (such as a server that's gone), or the PDS can't
 * answer the request.
 */
export interface ResolvedRoute {
  readonly error?: Error;
  readonly target: FederationTarget;
}

/**
 * The PDSes found for domains, by domain: the domain looked up, never one
 * a manifest names, so one domain's manifest can't take another's place
 * (a manifest for another domain is refused in discovery). A lookup that
 * failed a moment ago stands for a while, so a domain that's gone isn't
 * looked up again on every update of a query that routes to it.
 */
export class PdsDirectory {
  readonly byDomain = new Map<string, DiscoveredPds>();
  readonly #discover;
  readonly #failed = new Map<string, { at: number; error: Error }>();
  readonly #pending = new Map<string, Promise<DiscoveredPds>>();

  constructor(discover: (addressOrDomain: string) => Promise<DiscoveredPds>) {
    this.#discover = discover;
  }

  remember(pds: DiscoveredPds) {
    this.byDomain.set(pds.domain, pds);
  }

  /**
   * The PDS at a deployment URL, when exactly one known domain names it.
   * Any manifest can name any deployment, so when two do, neither is
   * taken for it.
   */
  atUrl(url: string) {
    const target = normalizeFederationUrl(url);
    const found = [...this.byDomain.values()].filter(
      (pds) => normalizeFederationUrl(pds.manifest.deploymentUrl) === target,
    );
    return found.length === 1 ? found[0] : undefined;
  }

  async resolve(addressOrDomain: string) {
    const domain = accountDomain(addressOrDomain);
    const existing = this.byDomain.get(domain);
    if (existing !== undefined) return existing;
    const pending = this.#pending.get(domain);
    if (pending !== undefined) return pending;
    const failed = this.#failed.get(domain);
    if (
      failed !== undefined &&
      Date.now() - failed.at < FAILED_LOOKUP_REUSE_MS
    ) {
      throw failed.error;
    }
    const resolution = this.#discover(addressOrDomain)
      .then((resolved) => {
        if (
          resolved.domain !== domain ||
          resolved.manifest.accountDomain !== domain
        ) {
          throw new Error(`The PDS found for ${domain} is another domain's`);
        }
        return resolved;
      })
      .then(
        (resolved) => {
          this.remember(resolved);
          return resolved;
        },
        (error: unknown) => {
          const reason = toError(error);
          this.#failed.set(domain, { at: Date.now(), error: reason });
          throw reason;
        },
      )
      .finally(() => {
        this.#pending.delete(domain);
      });
    this.#pending.set(domain, resolution);
    return resolution;
  }

  /**
   * Each route's PDS. A route whose PDS can't be found or can't answer the
   * request comes back with why, so the PDSes that can still answer do.
   */
  resolveRoutes(
    routes: readonly string[],
    request: AnyPdsQueryRequest,
  ): Promise<readonly ResolvedRoute[]> {
    return Promise.all(
      [...new Set(routes)].map(async (route) => {
        try {
          const pds = await this.resolve(route);
          assertPdsSupportsRequest(pds, request);
          return { target: pdsTarget(route, pds) };
        } catch (error) {
          return { error: toError(error), target: unresolvedTarget(route) };
        }
      }),
    );
  }
}

/** The routes that have a PDS to ask. */
export function resolvedTargets(routes: readonly ResolvedRoute[]) {
  return routes.flatMap((route) =>
    route.error === undefined ? [route.target] : [],
  );
}

/** Where a route that has no PDS to ask points: its domain. */
function unresolvedTarget(route: string): FederationTarget {
  return { id: route, url: `https://${accountDomain(route)}` };
}

/** A failed source for each domain whose routes have no PDS to ask. */
export function unresolvedSources(
  routes: readonly ResolvedRoute[],
): FederationSourceSnapshot<never>[] {
  const failed = routes.filter(
    (route): route is ResolvedRoute & { error: Error } =>
      route.error !== undefined,
  );
  return groupFederationTargets(failed.map(({ target }) => target)).map(
    (target) => ({
      error:
        failed.find(
          (route) => normalizeFederationUrl(route.target.url) === target.url,
        )?.error ?? new Error("PDS discovery failed"),
      status: "error",
      target,
    }),
  );
}

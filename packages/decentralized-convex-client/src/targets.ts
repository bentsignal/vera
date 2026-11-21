import type { DiscoveredPds } from "@decentralized-convex/address";

import type { FederationTarget, FederationTargetGroup } from "./types.ts";

/** A PDS as the target of a route (an account or domain on it). */
export function pdsTarget(id: string, pds: DiscoveredPds): FederationTarget {
  return { domain: pds.domain, id, url: pds.manifest.deploymentUrl };
}

/**
 * What tells sources apart: their deployment, and the domain that led to
 * it, so a domain whose manifest names another's deployment is asked (and
 * believed) apart from it.
 */
export function federationTargetKey(target: {
  readonly domain?: string;
  readonly url: string;
}) {
  const url = normalizeFederationUrl(target.url);
  return target.domain === undefined ? url : `${url}#${target.domain}`;
}

export function normalizeFederationUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && !isLocalHttp(url)) {
    throw new Error("Federation targets must use HTTPS except on localhost");
  }

  url.hash = "";
  url.pathname = "";
  url.search = "";
  return url.origin;
}

export function groupFederationTargets(
  targets: readonly FederationTarget[],
): readonly FederationTargetGroup[] {
  const groups = new Map<
    string,
    { domain?: string; ids: Set<string>; url: string }
  >();
  for (const target of targets) {
    const id = target.id.trim();
    if (id.length === 0)
      throw new Error("Federation target IDs cannot be empty");
    const url = normalizeFederationUrl(target.url);
    const key = federationTargetKey({ domain: target.domain, url });
    const group = groups.get(key) ?? {
      ...(target.domain === undefined ? {} : { domain: target.domain }),
      ids: new Set<string>(),
      url,
    };
    group.ids.add(id);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map(({ ids, ...group }) => ({ ...group, ids: [...ids].sort() }))
    .sort(
      (a, b) =>
        a.url.localeCompare(b.url) ||
        (a.domain ?? "").localeCompare(b.domain ?? ""),
    );
}

function isLocalHttp(url: URL) {
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  );
}

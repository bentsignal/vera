import type { FederationTarget, FederationTargetGroup } from "./types.ts";

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
  const idsByUrl = new Map<string, Set<string>>();
  for (const target of targets) {
    const id = target.id.trim();
    if (id.length === 0)
      throw new Error("Federation target IDs cannot be empty");
    const url = normalizeFederationUrl(target.url);
    const ids = idsByUrl.get(url) ?? new Set<string>();
    ids.add(id);
    idsByUrl.set(url, ids);
  }

  return [...idsByUrl]
    .map(([url, ids]) => ({ ids: [...ids].sort(), url }))
    .sort((a, b) => a.url.localeCompare(b.url));
}

function isLocalHttp(url: URL) {
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  );
}

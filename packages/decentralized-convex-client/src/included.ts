import type { DiscoveredPds } from "@decentralized-convex/address";
import { accountDomain } from "@decentralized-convex/address";

import type { SerializedIncludedResult } from "./pds.ts";
import type { FederationTarget, IncludedPdsQuery } from "./types.ts";
import { createFederatedSnapshot } from "./snapshot.ts";
import { groupFederationTargets, pdsTarget } from "./targets.ts";
import { sourceDomains, tryTrustedAnswer } from "./trust.ts";

/**
 * The included results the home PDS answers completely: those whose
 * routes lead nowhere else. Routes resolve only to PDSs already known
 * (`knownPds`, by domain), so this never waits on discovery; a result
 * routed anywhere new is left for its own query to gather. Each is
 * believed only as far as the home PDS speaks for it (see `trust.ts`).
 */
export function includedOnHome(
  included: readonly SerializedIncludedResult[],
  homeTarget: FederationTarget,
  knownPds: ReadonlyMap<string, DiscoveredPds>,
): IncludedPdsQuery[] {
  return included.flatMap(({ request, routes, value }) => {
    const known = routes.map((route) => {
      const pds = knownPds.get(accountDomain(route));
      return pds === undefined ? undefined : pdsTarget(route, pds);
    });
    const resolved = known.filter((target) => target !== undefined);
    if (resolved.length < known.length) return [];
    const targets = groupFederationTargets([homeTarget, ...resolved]);
    const [target] = targets;
    if (targets.length !== 1 || target === undefined) return [];
    const answer = tryTrustedAnswer(request, value, sourceDomains(target), {
      home: true,
    });
    if (answer.status === "error") return [];
    return [
      {
        request,
        snapshot: createFederatedSnapshot([{ ...answer, target }]),
      },
    ];
  });
}

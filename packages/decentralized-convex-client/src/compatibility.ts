import type { DiscoveredPds } from "@decentralized-convex/address";
import { DECENTRALIZED_CONVEX_LAST_CHANGED } from "@decentralized-convex/core";

import type { SerializedPdsRequest } from "./api.ts";
import { pdsApiRequirements } from "./api.ts";

export class IncompatiblePdsError extends Error {
  override readonly name = "IncompatiblePdsError";
}

/**
 * Verifies the exact wire contracts used by an application. The overall
 * ecosystem versions may differ when none of those contracts changed.
 */
export function assertPdsCompatibility(
  pds: DiscoveredPds,
  api: object,
): DiscoveredPds {
  const requirements = pdsApiRequirements(api);
  assertRequirements(pds, requirements.lastChanged, requirements.capabilities);
  return pds;
}

export function assertPdsRequestCompatibility(
  pds: DiscoveredPds,
  request: SerializedPdsRequest,
): DiscoveredPds {
  assertRequirements(pds, DECENTRALIZED_CONVEX_LAST_CHANGED.protocol, [
    { id: request.plugin, lastChanged: request.lastChanged },
  ]);
  return pds;
}

function assertRequirements(
  pds: DiscoveredPds,
  protocolLastChanged: string,
  capabilities: readonly { id: string; lastChanged: string }[],
) {
  if (pds.manifest.lastChanged !== protocolLastChanged) {
    throw new IncompatiblePdsError(
      `This client expects the PDS contract last changed in ${protocolLastChanged}, but ${pds.domain} reports ${pds.manifest.lastChanged}.`,
    );
  }

  const available = new Map(
    pds.manifest.capabilities?.map((capability) => [
      capability.id,
      capability.lastChanged,
    ]),
  );
  for (const required of capabilities) {
    const lastChanged = available.get(required.id);
    if (lastChanged === undefined) {
      throw new IncompatiblePdsError(
        `${pds.domain} does not provide the required ${required.id} plugin.`,
      );
    }
    if (lastChanged !== required.lastChanged) {
      throw new IncompatiblePdsError(
        `This client expects ${required.id} last changed in ${required.lastChanged}, but ${pds.domain} reports ${lastChanged}.`,
      );
    }
  }
}

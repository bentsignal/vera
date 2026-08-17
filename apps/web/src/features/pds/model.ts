import type { DiscoveredPds } from "@decentralized-convex/client";

/** Everything the client learns about one account's home PDS. */
export interface PdsHome {
  convexUrl: string;
  domain: string;
  manifestUrl: string;
  siteUrl: string;
}

/**
 * The proven two-home conversation. Real conversation discovery will replace
 * this single explicit prototype fixture.
 */
export const prototypeConversation = {
  id: "conversation:direct:a.vera.chat:b.vera.chat",
  participantDomains: ["a.vera.chat", "b.vera.chat"],
} as const;

export function pdsHomeFromDiscovery(discovery: DiscoveredPds): PdsHome {
  return {
    convexUrl: discovery.manifest.deploymentUrl,
    domain: discovery.domain,
    manifestUrl: discovery.manifestUrl,
    siteUrl: discovery.manifest.httpUrl,
  };
}

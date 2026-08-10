import type { DiscoveredPds } from "@decentralized-convex/client";

export interface HomeServer {
  convexUrl: string;
  domain: string;
  id: string;
  manifestUrl: string;
  siteUrl: string;
}

export const testHomeDomains = ["a.vera.chat", "b.vera.chat"] as const;

export const conversation = {
  id: "conversation:direct:a.vera.chat:b.vera.chat",
  participantDomains: testHomeDomains,
};

export function homeFromDiscovery(discovery: DiscoveredPds): HomeServer {
  return {
    convexUrl: discovery.manifest.deploymentUrl,
    domain: discovery.domain,
    id: discovery.domain,
    manifestUrl: discovery.manifestUrl,
    siteUrl: discovery.manifest.httpUrl,
  };
}

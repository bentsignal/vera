import type { DiscoveredPds } from "@decentralized-convex/client";

/** The verified PDS descriptor discovered from an account address. */
export type HomePds = DiscoveredPds;

/**
 * The proven two-home conversation. Real conversation discovery will replace
 * this single explicit prototype fixture.
 */
export const prototypeConversation = {
  id: "conversation:direct:a.vera.chat:b.vera.chat",
  participants: ["a.vera.chat", "b.vera.chat"],
} as const;

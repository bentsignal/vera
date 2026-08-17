/**
 * Every official decentralized Convex package and wire request ships on this
 * one release version. Never update a package version independently.
 */
export const DECENTRALIZED_CONVEX_VERSION = "0.1.0" as const;

/** All ecosystem releases that may be referenced by lastChanged metadata. */
export const DECENTRALIZED_CONVEX_RELEASES = ["0.1.0"] as const;

export type DecentralizedConvexVersion =
  (typeof DECENTRALIZED_CONVEX_RELEASES)[number];

/**
 * The ecosystem release in which each package or wire contract last actually
 * changed. Packages are still republished together on every release.
 */
export const DECENTRALIZED_CONVEX_LAST_CHANGED = Object.freeze({
  accounts: "0.1.0",
  address: "0.1.0",
  client: "0.1.0",
  core: "0.1.0",
  messages: "0.1.0",
  plugin: "0.1.0",
  protocol: "0.1.0",
  react: "0.1.0",
  server: "0.1.0",
  tanstackQuery: "0.1.0",
} as const satisfies Record<string, DecentralizedConvexVersion>);

export const decentralizedConvexRelease = Object.freeze({
  lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED,
  version: DECENTRALIZED_CONVEX_VERSION,
});

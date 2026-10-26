import { BREAKING_VERSION } from "../breaking-version";
import { OUTDATED_RUNTIMES } from "../outdated-runtimes";
import { query } from "./_generated/server";

/**
 * Which app versions this deployment works with (see breaking-version.ts).
 * Open apps watch it; a deploy re-runs every live query, so they see a
 * raise the moment it goes live. Public and signed-out, like discovery.
 */
export const breakingVersion = query({
  args: {},
  handler: () => BREAKING_VERSION,
});

/**
 * The app binaries (by native runtime, per platform) that must be replaced
 * from the store (see outdated-runtimes.ts). Open apps watch it, and one
 * listed asks to be updated. Public and signed-out, like `breakingVersion`.
 */
export const outdatedRuntimes = query({
  args: {},
  handler: () => OUTDATED_RUNTIMES,
});

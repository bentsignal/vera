import type { Delivery, Fix, Platform, ReportStage } from "../bug-reports";
import type { GitHubConfig } from "./github";
import { newestTag } from "../bug-reports";
import { github, read } from "./github";

// Whether a fix has reached people: its commit in the newest production
// release tags (docs/releasing.md → Release history in git).

/** The newest production releases, by kind (see docs/releasing.md). */
export async function latestReleases(config: GitHubConfig) {
  const [update, build, androidBuild, backend] = await Promise.all([
    newestRelease(config, "mobile/ota/production/"),
    newestRelease(config, "mobile/build/"),
    newestRelease(config, "mobile/android/build/"),
    newestRelease(config, "backend/deploy/"),
  ]);
  return { androidBuild, backend, build, update };
}

async function newestRelease(config: GitHubConfig, prefix: string) {
  const refs = await github(
    config,
    `/repos/${config.owner}/${config.name}/git/matching-refs/tags/${prefix}`,
  );
  return newestTag(
    (Array.isArray(refs) ? refs : [])
      .map((ref) => read(ref, "ref"))
      .filter((ref) => typeof ref === "string")
      .map((ref) => ref.slice("refs/tags/".length)),
  );
}

/** Whether `tag` contains commit `sha`. */
export async function tagIncludes(
  config: GitHubConfig,
  tag: string,
  sha: string,
) {
  const comparison = await github(
    config,
    `/repos/${config.owner}/${config.name}/compare/${sha}...${tag}?per_page=1`,
  );
  const status = read(comparison, "status");
  return status === "ahead" || status === "identical";
}

export type Releases = Awaited<ReturnType<typeof latestReleases>>;

/** The newest releases, read from GitHub the first time a fix needs them. */
export function lazyReleases(config: GitHubConfig) {
  let releases: Promise<Releases> | null = null;
  return () => (releases ??= latestReleases(config));
}

/** Whether a fix is in the releases it needs, and how it reached people. */
export async function delivered(
  config: GitHubConfig,
  releases: Releases,
  fix: Fix,
  platform: Platform,
): Promise<{ delivery?: Delivery; release?: string; stage: ReportStage }> {
  async function includes(tag: string | null) {
    return tag !== null && (await tagIncludes(config, tag, fix.sha));
  }
  if (fix.backend && !(await includes(releases.backend))) {
    return { stage: "fixed" };
  }
  if (!fix.app) return live("server", releases.backend);
  // Native fixes can't go over the air, even though later updates contain
  // their commit.
  if (!fix.native && (await includes(releases.update))) {
    return live("update", releases.update);
  }
  for (const build of storeBuilds(releases, platform)) {
    if (await includes(build)) return live("build", build);
  }
  return { stage: "fixed" };
}

function live(delivery: Delivery, release: string | null) {
  return { delivery, release: release ?? undefined, stage: "live" as const };
}

/** The store builds that reach this reporter's phone (both when unknown). */
function storeBuilds(releases: Releases, platform: Platform) {
  if (platform === "android") return [releases.androidBuild];
  if (platform === "ios") return [releases.build];
  return [releases.build, releases.androidBuild];
}

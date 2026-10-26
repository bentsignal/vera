// Whether this app binary has to be replaced from the store: its native
// runtime is on the backend's list of outdated ones
// (services/backend/outdated-runtimes.ts), served live so it reaches
// binaries that no over-the-air update can change any more. Plain rules, so
// they're tested on their own; `useMustReplaceBinary` applies them.

/** The backend's list, by platform, as far as this app can read it. */
export interface OutdatedRuntimes {
  readonly ios: readonly string[];
  readonly android: readonly string[];
}

export const NO_OUTDATED = { android: [], ios: [] } satisfies OutdatedRuntimes;

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * The backend's answer, read defensively: anything else (no answer yet, a
 * backend from before the list, a shape this app doesn't know) lists
 * nothing, so nobody is ever asked to update by mistake.
 */
export function readOutdated(value: unknown) {
  if (typeof value !== "object" || value === null) return NO_OUTDATED;
  return {
    android: strings("android" in value ? value.android : undefined),
    ios: strings("ios" in value ? value.ios : undefined),
  } satisfies OutdatedRuntimes;
}

/**
 * The list from the home PDS's answer, for the observer's `combine`: only
 * sources that answered are passed, so a PDS without the query (an error)
 * lists nothing.
 */
export function combineOutdated(sources: readonly { data: unknown }[]) {
  return readOutdated(sources[0]?.data);
}

/**
 * Whether a binary must be replaced: a store build (the `production`
 * channel) whose own runtime is listed for its platform. Dev clients,
 * internal and preview builds never are, and neither is a binary without
 * updates (no runtime). It doesn't depend on the native list's switch.
 */
export function mustReplaceBinary({
  channel,
  platform,
  runtime,
  outdated,
}: {
  channel: string | null;
  platform: string;
  runtime: string | null;
  outdated: OutdatedRuntimes;
}) {
  if (channel !== "production" || runtime === null) return false;
  if (platform === "ios") return outdated.ios.includes(runtime);
  if (platform === "android") return outdated.android.includes(runtime);
  return false;
}

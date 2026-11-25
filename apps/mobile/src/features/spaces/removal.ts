// Noticing when someone is removed from a space while they're looking at
// something in it. Plain functions, so they're tested without the app.

/** What a space needs to be matched against a screen. */
export interface WatchedSpace {
  readonly account: string;
  readonly channels: readonly { readonly conversationId: string }[];
  readonly name: string;
  readonly spaceId: string;
}

/** The params of the screen in front (`useGlobalSearchParams`). */
export type ScreenParams = Readonly<Record<string, unknown>>;

/** Spaces each account had before and no longer has, by account. */
export function lostSpaces<Space extends WatchedSpace>(
  before: ReadonlyMap<string, readonly Space[]>,
  after: ReadonlyMap<string, readonly Space[]>,
) {
  return [...after].flatMap(([account, spaces]) => {
    // An account that hasn't answered yet (or failed to) isn't compared:
    // only one that answered without a space it had counts.
    const had = before.get(account) ?? [];
    const kept = new Set(spaces.map((space) => space.spaceId));
    return had.filter((space) => !kept.has(space.spaceId));
  });
}

/**
 * Whether the screen in front is inside the space: it names the space
 * (`spaceId`) or one of its channels (`conversationId`, which threads,
 * channel info and the like carry too), as the space's account. Any
 * screen added under a space that names it either way is covered.
 */
export function isScreenInSpace(params: ScreenParams, space: WatchedSpace) {
  const { account, conversationId, spaceId } = params;
  if (typeof account === "string" && account !== space.account) return false;
  if (spaceId === space.spaceId) return true;
  return (
    typeof conversationId === "string" &&
    space.channels.some((channel) => channel.conversationId === conversationId)
  );
}

// Spaces the person is leaving themselves, as "<account> <spaceId>": those
// go without an alert.
const leaving = new Set<string>();

/** Notes that the account is leaving the space on its own. */
export function markLeaving(account: string, spaceId: string) {
  leaving.add(`${account} ${spaceId}`);
}

/** Whether the account left the space itself, forgetting it once asked. */
export function leftOnPurpose(account: string, spaceId: string) {
  return leaving.delete(`${account} ${spaceId}`);
}

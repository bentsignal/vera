import type { Typist } from "@decentralized-convex/messages";

// Who shows as typing. The PDS says how long each typist has left
// (`expiresIn`), and it's counted down from when that answer arrived, so
// this device's clock never has to agree with any PDS's.

/** How many people a typing indicator shows photos of. */
export const MAX_TYPING_FACES = 3;

/**
 * When each typist seen so far stops showing, by `scope` (the account and
 * conversation) and the PDS's time of their typing. Kept outside React, so
 * a conversation opened again doesn't count a typist's time from the
 * start once more.
 */
const deadlines = new Map<string, number>();
/** Deadlines older than this are forgotten, once there are many. */
const FORGET_AFTER_MS = 60_000;
const MAX_REMEMBERED = 200;

function forgetOld(now: number) {
  if (deadlines.size < MAX_REMEMBERED) return;
  for (const [key, deadline] of deadlines) {
    if (deadline < now - FORGET_AFTER_MS) deadlines.delete(key);
  }
}

/**
 * When a typist stops showing: `expiresIn` after the answer that first
 * had this bout of their typing arrived (`arrivedAt`).
 */
export function deadlineOf(scope: string, typist: Typist, arrivedAt: number) {
  const key = `${scope} ${typist.accountId} ${typist.typedAt}`;
  const known = deadlines.get(key);
  if (known !== undefined) return known;
  const deadline = arrivedAt + typist.expiresIn;
  forgetOld(arrivedAt);
  deadlines.set(key, deadline);
  return deadline;
}

/**
 * Who shows as typing, in the order they started (so someone joining is
 * added at the end and nobody moves), and when that next changes as
 * someone times out. A typist whose message came after their typing
 * (`lastSentAt`, by author, on the same PDS's clock) has sent it, even if
 * the news that they stopped hasn't arrived yet.
 */
export function shownTypists({
  typists,
  scope,
  arrivedAt,
  now,
  lastSentAt,
}: {
  typists: readonly Typist[];
  scope: string;
  arrivedAt: number;
  now: number;
  lastSentAt: ReadonlyMap<string, number>;
}) {
  // A PDS can answer more than once (as home and as a member's).
  const latest = new Map<string, Typist>();
  for (const typist of typists) {
    const seen = latest.get(typist.accountId);
    if (seen === undefined || seen.typedAt < typist.typedAt) {
      latest.set(typist.accountId, typist);
    }
  }
  const shown = [...latest.values()]
    .map((typist) => ({
      typist,
      until: deadlineOf(scope, typist, arrivedAt),
    }))
    .filter(
      ({ typist, until }) =>
        until > now &&
        (lastSentAt.get(typist.accountId) ?? -Infinity) < typist.typedAt,
    )
    .sort(
      (left, right) =>
        left.typist.startedAt - right.typist.startedAt ||
        left.typist.accountId.localeCompare(right.typist.accountId),
    );
  return {
    accountIds: shown.map(({ typist }) => typist.accountId),
    /** When the next typist times out; undefined with nobody typing. */
    nextChange:
      shown.length === 0
        ? undefined
        : Math.min(...shown.map(({ until }) => until)),
  };
}

/** The newest message time of each author, from messages oldest first. */
export function lastSentByAuthor(
  messages: readonly { authorId: string; sentAt: Date }[],
) {
  const sent = new Map<string, number>();
  for (const { authorId, sentAt } of messages) {
    sent.set(authorId, Math.max(sent.get(authorId) ?? 0, sentAt.getTime()));
  }
  return sent;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * What a typing indicator says: a name, two or three first names, or past
 * three, how many people (their photos say who).
 */
export function typingLabel(names: readonly string[]) {
  const [first = "", second = "", third = ""] = names;
  if (names.length <= 1) return `${first} is typing`;
  if (names.length === 2) {
    return `${firstName(first)} and ${firstName(second)} are typing`;
  }
  if (names.length === 3) {
    return `${firstName(first)}, ${firstName(second)}, and ${firstName(third)} are typing`;
  }
  return `${names.length} people are typing`;
}

/** The photos an indicator shows, and how many more people it counts. */
export function typingFaces<Person>(people: readonly Person[]) {
  // Four people show four photos rather than three and "+1".
  const faces =
    people.length <= MAX_TYPING_FACES + 1
      ? people
      : people.slice(0, MAX_TYPING_FACES);
  return { faces, more: people.length - faces.length };
}

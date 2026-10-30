import type { Mention } from "@decentralized-convex/messages";

// @mentions in the message field and in messages: finding the name being
// typed after an `@`, putting the picked person in, and where each
// mention sits in a message's text.

/** Someone who can be mentioned in a conversation. */
export interface MentionCandidate {
  readonly accountId: string;
  readonly avatarUrl: string | null;
  /** The name shown, which may be yours for them as a contact. */
  readonly displayName: string;
  /**
   * The name written after the `@`: their own, since everyone reads it.
   * Defaults to `displayName`.
   */
  readonly mentionName?: string;
}

/** A stretch of text: `[start, end)`. */
export interface TextRange {
  readonly end: number;
  readonly start: number;
}

/** Longest name typed after an `@` that still looks for someone. */
const MAX_QUERY_LENGTH = 40;

/** The most people the picker lists. */
export const MAX_SUGGESTIONS = 8;

function usernameOf(address: string) {
  return address.slice(0, address.lastIndexOf("@")) || address;
}

/**
 * The `@` being typed at the cursor and what follows it, if any: an `@` at
 * the start or after a space or line, with no line break before the
 * cursor. A name can have spaces in it ("@Maya Ch"), so the query runs
 * from the `@` to the cursor.
 */
export function mentionQuery(text: string, cursor: number) {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before.charAt(at - 1))) return null;
  const query = before.slice(at + 1);
  if (query.length > MAX_QUERY_LENGTH || /[\n@]/.test(query)) return null;
  // Two spaces, or a space first, ends the search.
  if (query.startsWith(" ") || query.includes("  ")) return null;
  return { query, start: at };
}

/**
 * Whether what follows an `@` is a mention already made, followed by a
 * space: the picker is done with it, though the name could still be read
 * as a search.
 */
export function isPicked(query: string, mentions: readonly Mention[]) {
  return mentions.some(({ name }) => query.startsWith(`${name} `));
}

/**
 * Whether a person matches what's typed after the `@`: it starts their
 * display name, any word in it, or their username.
 */
function matches(candidate: MentionCandidate, query: string) {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  const names = new Set([
    candidate.displayName.toLowerCase(),
    (candidate.mentionName ?? candidate.displayName).toLowerCase(),
  ]);
  return (
    [...names].some(
      (name) =>
        name.startsWith(needle) ||
        name.split(/\s+/).some((word) => word.startsWith(needle)),
    ) || usernameOf(candidate.accountId).toLowerCase().startsWith(needle)
  );
}

/** The people to suggest for a query, by name. */
export function suggestions(
  candidates: readonly MentionCandidate[],
  query: string,
) {
  return candidates
    .filter((candidate) => matches(candidate, query))
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * Puts `@name ` in place of the `@query` that starts at `start` and runs
 * to the cursor, returning the new text and where the cursor goes.
 */
export function insertMention(
  text: string,
  start: number,
  cursor: number,
  name: string,
) {
  const inserted = `@${name} `;
  // A space already after the cursor serves as the one after the name.
  const rest = text.slice(cursor).replace(/^ /, "");
  return {
    cursor: start + inserted.length,
    text: text.slice(0, start) + inserted + rest,
  };
}

/**
 * Where each mention's `@name` appears in the text, in order, without
 * overlaps (longer names first, so "@Maya Chen" isn't read as "@Maya").
 * A mention that appears more than once marks each.
 */
export function mentionRanges(
  text: string,
  mentions: readonly Mention[] | undefined,
) {
  if (mentions === undefined || mentions.length === 0) return [];
  // Each name once, with whoever it names first.
  const byName = new Map<string, string>();
  for (const { accountId, name } of mentions) {
    if (!byName.has(name)) byName.set(name, accountId);
  }
  const names = [...byName.keys()].sort(
    (left, right) => right.length - left.length,
  );
  const found = new Array<TextRange & { accountId: string }>();
  for (const name of names) {
    const accountId = byName.get(name) ?? "";
    const token = `@${name}`;
    let from = text.indexOf(token);
    while (from !== -1) {
      const end = from + token.length;
      if (!found.some((range) => from < range.end && end > range.start)) {
        found.push({ accountId, end, start: from });
      }
      from = text.indexOf(token, end);
    }
  }
  return found.sort((left, right) => left.start - right.start);
}

/** The mentions whose `@name` is still in the text. */
export function keptMentions(text: string, mentions: readonly Mention[]) {
  return mentions.filter(({ name }) => text.includes(`@${name}`));
}

/**
 * When an edit deletes one character inside a mention, the whole mention
 * goes, like a token: the text without it and where the cursor goes.
 * Null for any other edit.
 */
export function deleteWholeMention(
  before: string,
  after: string,
  mentions: readonly Mention[],
) {
  if (after.length !== before.length - 1) return null;
  let at = 0;
  while (at < after.length && before[at] === after[at]) at += 1;
  if (before.slice(at + 1) !== after.slice(at)) return null;
  const range = mentionRanges(before, mentions).find(
    ({ end, start }) => at >= start && at < end,
  );
  if (range === undefined) return null;
  return {
    cursor: range.start,
    text: before.slice(0, range.start) + before.slice(range.end),
  };
}

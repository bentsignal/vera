import type { ReactionPart } from "./reaction-part.ts";
import { parsePart } from "./reaction-part.ts";

// This device's reaction toggles still on their way to the server, which
// show at once over what the server has said (see `useReactions`). Plain
// state changes, so they're tested on their own.

/** A pending toggle's key: the message, the part, and the emoji. */
export function overrideKey(
  messageId: string,
  part: ReactionPart,
  emoji: string,
) {
  return `${messageId} ${part} ${emoji}`;
}

export function parseOverrideKey(key: string) {
  const [messageId = "", part = "", emoji = ""] = key.split(" ");
  return { emoji, messageId, part: parsePart(part) };
}

/** The newest toggle of a key: on or off, and which toggle it was. */
export interface Pending {
  readonly on: boolean;
  readonly seq: number;
}

/**
 * A toggle of `key`, the `seq`th: on if what shows now is off. What shows
 * is the newest pending toggle of the key if there is one, not the
 * reactions last rendered, so two taps before the next render are two
 * toggles (on, then off), not two "on"s. `mine` is the server's answer
 * for the key, which shows when nothing is pending.
 */
export function toggled(
  pending: ReadonlyMap<string, Pending>,
  key: string,
  mine: boolean,
  seq: number,
) {
  const on = !(pending.get(key)?.on ?? mine);
  const next = new Map(pending);
  next.set(key, { on, seq });
  return { next, on };
}

/**
 * The toggle `seq` of `key` has its answer, done or failed. Only the
 * newest toggle of a key lets it go: an older one's answer arriving while
 * a newer toggle is on its way leaves the newer one showing. Let go, the
 * key shows the server's answer again, which has it by now or, if it
 * failed, never changed, so a failure rolls back.
 */
export function settled(
  pending: ReadonlyMap<string, Pending>,
  key: string,
  seq: number,
) {
  if (pending.get(key)?.seq !== seq) return pending;
  const next = new Map(pending);
  next.delete(key);
  return next;
}

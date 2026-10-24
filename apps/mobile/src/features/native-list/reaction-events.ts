import type { Message } from "../conversation/types.ts";
import type { Frame, ListEvent } from "./contract.ts";
import type { ReactionPart } from "~/features/messaging/reactions";
import type { MessageLayout } from "~/features/preferences/store";
import { heldPart } from "./held-part.ts";
import { parseReactionKey } from "./map-blocks.ts";

// What a tap or hold on a reaction does, as the React Native list's
// reactions do: a stacked chip toggles when tapped and shows who reacted
// when held (`PartChips`); a bubble's tapbacks show who reacted either
// way, lifting their part into the glass menu (`Tapbacks`).

type Event = Extract<ListEvent, { type: "hold" | "press" }>;

/** Toggle it, show who reacted in the sheet, or in the menu over `frame`. */
export interface ReactionAction {
  readonly kind: "menu" | "sheet" | "toggle";
  readonly emoji: string;
  readonly part: ReactionPart;
  readonly frame?: Frame;
}

/** What JavaScript does for a reaction event, or null if it isn't one. */
export function reactionAction(event: Event, layout: MessageLayout) {
  if (event.element !== "reaction" || event.reactionKey === undefined) {
    return null;
  }
  const { emoji, part } = parseReactionKey(event.reactionKey);
  if (layout === "stacked") {
    const kind = event.type === "press" ? "toggle" : "sheet";
    return { emoji, kind, part } satisfies ReactionAction;
  }
  // Older binaries send no frame with a tap: the sheet, then.
  if (event.frame === undefined) {
    return { emoji, kind: "sheet", part } satisfies ReactionAction;
  }
  return {
    emoji,
    frame: event.frame,
    kind: "menu",
    part,
  } satisfies ReactionAction;
}

/**
 * Where the reactions menu opens for a reaction on `part`: the event's
 * place when it names that part (keeping its media `index`, which the
 * lift uses), and otherwise the reaction's own part. Native reports the
 * part a reaction belongs to, so they should agree; if a binary ever
 * reports another (a row's tapback over its text for a reaction on its
 * photo), the menu still shows who reacted to the right piece.
 */
export function reactionMenuPlace(
  message: Message,
  part: ReactionPart,
  event: { rowId: string; part?: string; index?: number; frame: Frame },
) {
  if (heldPart(message, event).part === part) return event;
  return { frame: event.frame, part: String(part), rowId: event.rowId };
}

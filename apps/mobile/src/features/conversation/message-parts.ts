import type { Message } from "./types";
import { visibleBody } from "./message-text.ts";

/**
 * The part a message's link card is: the first of a message whose text is
 * only links (so it shows none) is the message itself, as its text would
 * be, so a reaction to it is one older apps show too.
 */
export function linkPart(message: Message, index: number) {
  return index === 0 && visibleBody(message) === undefined
    ? ("message" as const)
    : (`link-${index}` as const);
}

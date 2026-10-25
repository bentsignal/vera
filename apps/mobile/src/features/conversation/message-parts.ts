import type { Message } from "./types";
import { attachmentPart } from "../messaging/reaction-part.ts";
import { linkCardsOf, visibleBody } from "./message-text.ts";

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

/**
 * How many parts of a message take reactions: its attachments, its link
 * cards, and its text when it shows.
 */
export function partCount(message: Message) {
  const text = visibleBody(message) === undefined ? 0 : 1;
  return message.attachments.length + linkCardsOf(message).length + text;
}

/**
 * The part whose chips go under the whole message in a stacked row, under
 * its thread's count: its last one.
 */
export function lastPart(message: Message) {
  const cards = linkCardsOf(message).length;
  const attachments = message.attachments.length;
  if (cards > 0) return linkPart(message, cards - 1);
  return attachments > 0 ? attachmentPart(message, attachments - 1) : "message";
}

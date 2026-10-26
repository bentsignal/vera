import type { Message, MessageAttachment } from "../conversation/types.ts";
import type { ReactionPart } from "../messaging/reaction-part.ts";
import { linkCardsOf, visibleBody } from "../conversation/message-text.ts";
import { attachmentPart, parsePart } from "../messaging/reaction-part.ts";

// Which part of a message a tap or hold in the native list landed on,
// from what the event reports: an item of its media (`index`) or a part.

/** A message's photos and videos, with their places among its attachments. */
export function mediaOf(message: Message) {
  return message.attachments.flatMap((attachment, index) =>
    attachment.kind === "file" ? [] : [{ attachment, index }],
  );
}

/** What a part of a message is: an attachment, a link card, or its text. */
export interface HeldPart {
  readonly part: ReactionPart;
  readonly attachment?: MessageAttachment;
  /** The link of a link card. */
  readonly link?: string;
}

function attachmentOf(message: Message, part: ReactionPart) {
  if (typeof part === "number") return message.attachments[part];
  if (part === "message" && message.body === undefined) {
    return message.attachments[0];
  }
  return undefined;
}

function linkOf(message: Message, part: ReactionPart) {
  const cards = linkCardsOf(message);
  if (typeof part === "string" && part.startsWith("link-")) {
    return cards[Number(part.slice("link-".length))]?.link;
  }
  // The first card is the message itself when its text is only links.
  if (
    part === "message" &&
    message.attachments.length === 0 &&
    visibleBody(message) === undefined
  ) {
    return cards[0]?.link;
  }
  return undefined;
}

/**
 * The part an event is about: the media item at `index` when it reports
 * one, its `part` otherwise, and the message's text when neither.
 */
export function heldPart(
  message: Message,
  event: { readonly part?: string; readonly index?: number },
) {
  if (event.index !== undefined) {
    const item = mediaOf(message)[event.index];
    if (item !== undefined) {
      return {
        attachment: item.attachment,
        part: attachmentPart(message, item.index),
      } satisfies HeldPart;
    }
  }
  const part = parsePart(event.part ?? "message");
  if (typeof part === "number" && Number.isNaN(part)) {
    return { part: "message" } satisfies HeldPart;
  }
  return {
    attachment: attachmentOf(message, part),
    link: linkOf(message, part),
    part,
  } satisfies HeldPart;
}

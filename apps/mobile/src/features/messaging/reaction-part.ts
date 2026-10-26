// Which part of a message a reaction is on, apart from the queries in
// `reactions.ts` so code without React (and its tests) can use it.

/**
 * Which part of a message a reaction is on: one of its attachments, by
 * index, one of its link previews (`link-<index>`), or `message`, the
 * message itself (its text, or its first attachment when it has no text,
 * or its first link preview when its text is only links; see `reaction`
 * in the protocol).
 */
export type ReactionPart = number | "message" | `link-${number}`;

/**
 * The part a message's attachment is: the first of a message without text
 * is the message itself, so a reaction to it is one older apps show too.
 */
export function attachmentPart(
  message: { readonly body?: string },
  index: number,
) {
  return index === 0 && message.body === undefined
    ? ("message" as const)
    : index;
}

/** A part written out as text (a route's, or `overrideKey`'s), read back. */
export function parsePart(part: string) {
  if (part === "message") return "message" as const;
  const link = /^link-(\d+)$/.exec(part)?.[1];
  if (link !== undefined) return `link-${Number(link)}` as const;
  return Number(part);
}

/** A reaction's part, from the protocol's `attachment` and `link`. */
export function reactionPart({
  attachment,
  link,
}: {
  attachment?: number;
  link?: number;
}) {
  if (link !== undefined) return `link-${link}` as const;
  return attachment ?? ("message" as const);
}

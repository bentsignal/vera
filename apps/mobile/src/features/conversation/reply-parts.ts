import type { Quote } from "./types";

// What reply cards share with the rest of the conversation.

/** How far a bubble reply sits in from its quote, making room for the curve. */
export const REPLY_INDENT = 22;

/** The quote's text: the original's, or what it sent instead. */
export function quoteText(quote: Quote) {
  if (quote.deleted === true) return "Deleted message";
  if (quote.body.length > 0) return quote.body;
  const kind = quote.attachment?.kind;
  if (kind === undefined) return "Message";
  return { file: "File", image: "Photo", video: "Video" }[kind];
}

/** A bubble reply's indent under its quote, on its side. */
export function replyIndent(isOwn: boolean) {
  return isOwn ? { paddingRight: REPLY_INDENT } : { paddingLeft: REPLY_INDENT };
}

import type { Quote } from "./types";

/** The quote's text: the original's, or what it sent instead. */
export function quoteText(quote: Quote) {
  if (quote.deleted === true) return "Deleted message";
  if (quote.body.length > 0) return quote.body;
  const kind = quote.attachment?.kind;
  if (kind === undefined) return "Message";
  return { file: "File", image: "Photo", video: "Video" }[kind];
}

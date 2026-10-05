const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;
const TRAILING_PUNCTUATION = /[).,!?]+$/;

/** Where the link a message's preview is made from sits in its body. */
function previewedLink(body: string) {
  const match = URL_PATTERN.exec(body);
  if (match === null) return undefined;
  const url = match[0].replace(TRAILING_PUNCTUATION, "");
  return { end: match.index + url.length, start: match.index, url };
}

/** The link a message's preview is made from: the first one in its body. */
export function previewedUrl(body: string) {
  return previewedLink(body)?.url;
}

/** Trims spaces and tabs, but keeps line breaks. */
function trimEnd(text: string) {
  return text.replace(/[^\S\n]+$/, "");
}

function trimStart(text: string) {
  return text.replace(/^[^\S\n]+/, "");
}

/** Tidies the text on either side of a cut-out link so it reads naturally. */
function close(before: string, after: string): [string, string] {
  // "(https://…)" leaves nothing worth keeping between the brackets.
  if (before.endsWith("(") && after.startsWith(")")) {
    return close(trimEnd(before.slice(0, -1)), trimStart(after.slice(1)));
  }
  // Sentence punctuation after the link closes the text before it, unless
  // that text already ends in punctuation ("Look: https://….").
  const punctuation = /^[.,!?]+(?=\s|$)/.exec(after)?.[0];
  if (punctuation !== undefined) {
    const rest = trimStart(after.slice(punctuation.length));
    return [
      /[\p{L}\p{N}]$/u.test(before) ? before + punctuation : before,
      rest,
    ];
  }
  // A link on a line of its own takes its line with it.
  if (before.endsWith("\n") && after.startsWith("\n")) {
    return [before, after.slice(1)];
  }
  return [before, after];
}

/**
 * The body with its previewed link cut out, for showing beside the preview
 * card. Empty when the message was only the link.
 */
export function withoutPreviewedUrl(body: string) {
  const link = previewedLink(body);
  if (link === undefined) return body;
  const [before, after] = close(
    trimEnd(body.slice(0, link.start)),
    trimStart(body.slice(link.end)),
  );
  const joined =
    before === "" ||
    after === "" ||
    before.endsWith("\n") ||
    after.startsWith("\n")
      ? before + after
      : `${before} ${after}`;
  return joined.replace(/\n{3,}/g, "\n\n").trim();
}

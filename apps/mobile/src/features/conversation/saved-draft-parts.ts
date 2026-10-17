import type { Attachment, Quote } from "@decentralized-convex/messages";

// Reading back what a draft saved (see `drafts.ts`): values that may be
// missing or malformed after an update, or in a damaged file.

export const KINDS = ["file", "image", "video"] as const;

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

export function stringIn(stored: object, key: string) {
  return asString(Reflect.get(stored, key));
}

export function numberIn(stored: object, key: string) {
  return asNumber(Reflect.get(stored, key));
}

export function mentionsFrom(stored: unknown) {
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((mention: unknown) => {
    if (typeof mention !== "object" || mention === null) return [];
    const accountId = stringIn(mention, "accountId");
    const name = stringIn(mention, "name");
    return accountId === undefined || name === undefined
      ? []
      : [{ accountId, name }];
  });
}

function attachmentFrom(stored: unknown) {
  if (typeof stored !== "object" || stored === null) return undefined;
  const kind = KINDS.find(
    (candidate) => candidate === Reflect.get(stored, "kind"),
  );
  const mimeType = stringIn(stored, "mimeType");
  const name = stringIn(stored, "name");
  const size = numberIn(stored, "size");
  const url = stringIn(stored, "url");
  if (
    kind === undefined ||
    mimeType === undefined ||
    name === undefined ||
    size === undefined ||
    url === undefined
  ) {
    return undefined;
  }
  return {
    kind,
    mimeType,
    name,
    size,
    url,
    ...attachmentDetails(stored),
  } satisfies Attachment;
}

/** An attachment's optional sizes and poster. */
function attachmentDetails(stored: object) {
  const durationMs = numberIn(stored, "durationMs");
  const height = numberIn(stored, "height");
  const thumbnailUrl = stringIn(stored, "thumbnailUrl");
  const width = numberIn(stored, "width");
  return {
    ...(durationMs !== undefined && { durationMs }),
    ...(height !== undefined && { height }),
    ...(thumbnailUrl !== undefined && { thumbnailUrl }),
    ...(width !== undefined && { width }),
  };
}

function quoteFrom(stored: unknown) {
  if (typeof stored !== "object" || stored === null) return undefined;
  const authorId = stringIn(stored, "authorId");
  const body = stringIn(stored, "body");
  if (authorId === undefined || body === undefined) return undefined;
  const attachment = attachmentFrom(Reflect.get(stored, "attachment"));
  return {
    authorId,
    body,
    ...(attachment !== undefined && { attachment }),
  } satisfies Quote;
}

export function replyToFrom(stored: unknown) {
  if (typeof stored !== "object" || stored === null) return undefined;
  const id = stringIn(stored, "id");
  const quote = quoteFrom(Reflect.get(stored, "quote"));
  if (id === undefined || quote === undefined) return undefined;
  return { id, quote, threadId: stringIn(stored, "threadId") };
}

import type { Attachment } from "./protocol.ts";
import { fail } from "./model.ts";
import { MAX_ATTACHMENTS } from "./protocol.ts";

// What a message may hold, sent or edited.

const MAX_BODY_LENGTH = 4_000;

export function validateMessage(
  body: string,
  attachments: readonly Attachment[],
) {
  if (body.length === 0 && attachments.length === 0) fail("EMPTY_MESSAGE");
  if (body.length > MAX_BODY_LENGTH) fail("INVALID_MESSAGE_BODY");
  if (attachments.length > MAX_ATTACHMENTS) fail("TOO_MANY_ATTACHMENTS");
  const urls = attachments.flatMap((attachment) =>
    attachment.thumbnailUrl === undefined
      ? [attachment.url]
      : [attachment.url, attachment.thumbnailUrl],
  );
  if (!urls.every(isHttpsUrl)) fail("INVALID_ATTACHMENT");
}

export function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

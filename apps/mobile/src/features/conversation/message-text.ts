import { withoutPreviewedUrl } from "@decentralized-convex/messages";

import type { Message } from "./types";

/** The text to show for a message; a previewed link is left to its card. */
export function visibleBody(message: Message) {
  if (message.body === undefined || message.linkPreview === undefined) {
    return message.body;
  }
  const text = withoutPreviewedUrl(message.body);
  return text.length > 0 ? text : undefined;
}

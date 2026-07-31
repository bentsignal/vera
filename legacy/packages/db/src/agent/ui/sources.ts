import type { SourceDocumentUIPart, SourceUrlUIPart } from "ai";
import type { Infer } from "convex/values";

import type { MessageDoc, SourcePart, vSource } from "../validators";
import { extractText } from "../shared";

export function extractTextFromMessageDoc(message: MessageDoc) {
  const extracted = message.message && extractText(message.message);
  if (extracted) return extracted;
  if (message.text) return message.text;
  return "";
}

export function toSourcePart(part: SourcePart | Infer<typeof vSource>) {
  if (part.sourceType === "url") {
    return {
      type: "source-url",
      url: part.url,
      sourceId: part.id,
      providerMetadata: part.providerMetadata,
      title: part.title,
    } satisfies SourceUrlUIPart;
  }
  return {
    type: "source-document",
    mediaType: part.mediaType,
    sourceId: part.id,
    title: part.title,
    filename: part.filename,
    providerMetadata: part.providerMetadata,
  } satisfies SourceDocumentUIPart;
}

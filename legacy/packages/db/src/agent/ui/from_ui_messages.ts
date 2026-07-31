import type { Infer } from "convex/values";
import { convertToModelMessages } from "ai";
import { omit, pick } from "convex-helpers";

import type { MessageDoc, ProviderOptions, vSource } from "../validators";
import type { UIMessage } from "./types";
import { fromModelMessage } from "../mapping";
import { extractReasoning, extractText, isTool } from "../shared";

/**
 * Converts a list of UIMessages to MessageDocs, along with extra metadata that
 * may be available to associate with the MessageDocs.
 */
type SavedMessageDoc<METADATA> = MessageDoc & {
  streaming: boolean;
  metadata?: METADATA;
};

/**
 * Returns the input unchanged but widened to `SavedMessageDoc<METADATA>`.
 * Used to give callers of `fromUIMessages` a `MessageDoc`-shaped view so they
 * can `pick` across its optional fields even though we only populate some.
 */
function asSavedDoc<METADATA>(doc: SavedMessageDoc<METADATA>) {
  return doc;
}

export async function fromUIMessages<METADATA = unknown>(
  messages: UIMessage<METADATA>[],
  meta: {
    threadId: string;
    userId?: string;
    model?: string;
    provider?: string;
    providerOptions?: ProviderOptions;
    metadata?: METADATA;
  },
) {
  const nested = await Promise.all(
    messages.map(async (uiMessage) => {
      const stepOrder = uiMessage.stepOrder;
      const commonFields = asSavedDoc<METADATA>({
        ...pick(meta, [
          "threadId",
          "userId",
          "model",
          "provider",
          "providerOptions",
          "metadata",
        ]),
        ...omit(uiMessage, ["parts", "role", "key", "text", "userId"]),
        userId: uiMessage.userId ?? meta.userId,
        status: uiMessage.status === "streaming" ? "pending" : "success",
        streaming: uiMessage.status === "streaming",
        _id: uiMessage.id,
        tool: false,
      });
      const modelMessages = await convertToModelMessages([uiMessage]);
      return modelMessages
        .map((modelMessage, i) => {
          if (modelMessage.content.length === 0) {
            return undefined;
          }
          const message = fromModelMessage(modelMessage);
          const tool = isTool(message);
          const doc = asSavedDoc<METADATA>({
            ...commonFields,
            _id: uiMessage.id + `-${i}`,
            stepOrder: stepOrder + i,
            message,
            tool,
            text: extractText(message),
            reasoning: extractReasoning(message),
            finishReason: tool ? "tool-calls" : "stop",
            sources: fromSourceParts(uiMessage.parts),
          });
          return applyProviderMetadata(doc, modelMessage.content);
        })
        .filter((d) => d !== undefined);
    }),
  );
  return nested.flat();
}

function applyProviderMetadata<METADATA>(
  doc: SavedMessageDoc<METADATA>,
  content: string | readonly object[],
) {
  if (typeof content === "string") return doc;
  const partWithProviderOptions = content.find(
    (c) => "providerOptions" in c && c.providerOptions !== undefined,
  );
  if (!partWithProviderOptions) return doc;
  if (!("providerOptions" in partWithProviderOptions)) return doc;
  const providerOptions = partWithProviderOptions.providerOptions;
  if (!isProviderOptions(providerOptions)) return doc;
  // convertToModelMessages changes providerMetadata to providerOptions
  return {
    ...doc,
    providerMetadata: providerOptions,
    providerOptions: doc.providerOptions ?? providerOptions,
  };
}

function isProviderOptions(
  value: unknown,
): value is Record<string, Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function fromSourceParts(parts: UIMessage["parts"]) {
  return parts
    .map((part) => {
      if (part.type === "source-url") {
        return {
          type: "source",
          sourceType: "url",
          url: part.url,
          id: part.sourceId,
          providerMetadata: part.providerMetadata,
          title: part.title,
        } satisfies Infer<typeof vSource>;
      }
      if (part.type === "source-document") {
        return {
          type: "source",
          sourceType: "document",
          mediaType: part.mediaType,
          id: part.sourceId,
          providerMetadata: part.providerMetadata,
          title: part.title,
        } satisfies Infer<typeof vSource>;
      }
      return undefined;
    })
    .filter((p) => p !== undefined);
}

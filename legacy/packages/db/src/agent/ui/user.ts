import type { UIDataTypes, UITools, UserContent } from "ai";

import type { MessageDocWithExtras, UIMessage } from "./types";
import { toModelMessage, toUIFilePart } from "../mapping";
import { extractTextFromMessageDoc } from "./sources";

/**
 * Build a `UIMessage["parts"]` array — takes the array as a parameter so the
 * caller can use parameter type annotations (allowed by lint) to widen the
 * initial `[]` to the full `UIMessagePart` union.
 */
function partsArray<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(parts: UIMessage<METADATA, DATA_PARTS, TOOLS>["parts"]) {
  return parts;
}

type UserContentPart = Exclude<UserContent, string>[number];

/**
 * Narrow an arbitrary `ModelMessage["content"]` to the user-content parts.
 * We only call this from `createUserUIMessage` (the grouping logic ensures
 * the doc is a user-role message), so the runtime shape will always be a
 * user-content array when non-empty.
 */
function extractUserContent(content: unknown) {
  if (typeof content !== "object" || content === null) return [];
  if (!Array.isArray(content)) return [];
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- caller guarantees this is a user-role message; content shape matches UserContent
  return content as Exclude<UserContent, string>;
}

export function createUserUIMessage<
  METADATA = unknown,
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
>(message: MessageDocWithExtras<METADATA>) {
  const text = extractTextFromMessageDoc(message);
  const rawMessage = message.message;
  if (!rawMessage) {
    throw new Error("createUserUIMessage requires a message with content");
  }
  const coreMessage = toModelMessage(rawMessage);
  const nonStringContent = extractUserContent(coreMessage.content);

  const partCommon = {
    state: message.streaming ? ("streaming" as const) : ("done" as const),
    ...(message.providerMetadata
      ? { providerMetadata: message.providerMetadata }
      : {}),
  };

  const parts = partsArray<METADATA, DATA_PARTS, TOOLS>([]);
  if (text && !nonStringContent.length) {
    parts.push({ type: "text", text });
  }
  for (const contentPart of nonStringContent) {
    pushUserPart<METADATA, DATA_PARTS, TOOLS>(parts, contentPart, partCommon);
  }

  return {
    id: message._id,
    _creationTime: message._creationTime,
    order: message.order,
    stepOrder: message.stepOrder,
    status: message.streaming ? "streaming" : message.status,
    key: `${message.threadId}-${message.order}-${message.stepOrder}`,
    text,
    role: "user" as const,
    userId: message.userId,
    parts,
    metadata: message.metadata,
  } satisfies UIMessage<METADATA, DATA_PARTS, TOOLS>;
}

function pushUserPart<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  parts: UIMessage<METADATA, DATA_PARTS, TOOLS>["parts"],
  contentPart: UserContentPart,
  partCommon: { state: "streaming" | "done" },
) {
  switch (contentPart.type) {
    case "text":
      parts.push({ type: "text", text: contentPart.text, ...partCommon });
      return;
    case "file":
    case "image":
      parts.push(toUIFilePart(contentPart));
      return;
    default:
      console.warn("Unexpected content part type for user", contentPart);
  }
}

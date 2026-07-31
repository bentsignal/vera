import type { TextUIPart, UIDataTypes, UITools } from "ai";

import type { MessageDocWithExtras, UIMessage } from "./types";
import { extractTextFromMessageDoc } from "./sources";

export function createSystemUIMessage<
  METADATA = unknown,
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
>(message: MessageDocWithExtras<METADATA>) {
  const text = extractTextFromMessageDoc(message);
  const partCommon = {
    state: message.streaming ? ("streaming" as const) : ("done" as const),
    ...(message.providerMetadata
      ? { providerMetadata: message.providerMetadata }
      : {}),
  };

  return {
    id: message._id,
    _creationTime: message._creationTime,
    order: message.order,
    stepOrder: message.stepOrder,
    status: message.streaming ? "streaming" : message.status,
    key: `${message.threadId}-${message.order}-${message.stepOrder}`,
    text,
    role: "system" as const,
    agentName: message.agentName,
    userId: message.userId,
    parts: [{ type: "text", text, ...partCommon } satisfies TextUIPart],
    metadata: message.metadata,
  } satisfies UIMessage<METADATA, DATA_PARTS, TOOLS>;
}

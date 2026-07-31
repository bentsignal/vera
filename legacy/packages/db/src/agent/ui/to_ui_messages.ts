import type { UIDataTypes, UITools } from "ai";

import type { MessageDocWithExtras, UIMessage } from "./types";
import { sorted } from "../shared";
import { createAssistantUIMessage } from "./assistant/create_assistant_ui_message";
import { groupAssistantMessages } from "./group_assistant_messages";
import { createSystemUIMessage } from "./system";
import { createUserUIMessage } from "./user";

/**
 * Converts a list of MessageDocs to UIMessages. This is somewhat lossy since
 * many fields are not supported by UIMessages (model, provider, userId, etc.).
 * The augmented `UIMessage` type includes additional fields like key, order,
 * stepOrder, status, agentName, and text.
 */
function emptyList<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(list: UIMessage<METADATA, DATA_PARTS, TOOLS>[]) {
  return list;
}

export function toUIMessages<
  METADATA = unknown,
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
>(messages: MessageDocWithExtras<METADATA>[]) {
  const groups = groupAssistantMessages(sorted(messages));

  const uiMessages = emptyList<METADATA, DATA_PARTS, TOOLS>([]);
  for (const group of groups) {
    if (group.role === "system") {
      uiMessages.push(
        createSystemUIMessage<METADATA, DATA_PARTS, TOOLS>(group.message),
      );
    } else if (group.role === "user") {
      uiMessages.push(
        createUserUIMessage<METADATA, DATA_PARTS, TOOLS>(group.message),
      );
    } else {
      uiMessages.push(
        createAssistantUIMessage<METADATA, DATA_PARTS, TOOLS>(group.messages),
      );
    }
  }

  return uiMessages;
}

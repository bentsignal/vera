import type { MessageDocWithExtras } from "./types";
import { toModelMessage } from "../mapping";

export type Group<METADATA = unknown> =
  | {
      role: "user";
      message: MessageDocWithExtras<METADATA>;
    }
  | {
      role: "system";
      message: MessageDocWithExtras<METADATA>;
    }
  | {
      role: "assistant";
      messages: MessageDocWithExtras<METADATA>[];
    };

/**
 * Group contiguous assistant/tool messages together so a single `UIMessage`
 * can represent a full assistant turn (including its tool calls/results).
 */
function makeGroupingState<METADATA>() {
  return identityState<METADATA>({
    groups: [],
    currentGroup: [],
    // -1 sentinel means "unset"; we track set/unset via hasCurrentOrder
    // to avoid a `number | undefined` `let` type annotation.
    currentOrder: -1,
    hasCurrentOrder: false,
  });
}

function identityState<METADATA>(state: GroupingState<METADATA>) {
  return state;
}

interface GroupingState<METADATA> {
  groups: Group<METADATA>[];
  currentGroup: MessageDocWithExtras<METADATA>[];
  currentOrder: number;
  hasCurrentOrder: boolean;
}

function flushAssistant<METADATA>(state: GroupingState<METADATA>) {
  if (state.currentGroup.length > 0) {
    state.groups.push({ role: "assistant", messages: state.currentGroup });
    state.currentGroup = [];
    state.hasCurrentOrder = false;
  }
}

export function groupAssistantMessages<METADATA = unknown>(
  messages: MessageDocWithExtras<METADATA>[],
) {
  const state = makeGroupingState<METADATA>();

  for (const message of messages) {
    const coreMessage = message.message && toModelMessage(message.message);
    if (!coreMessage) continue;

    if (coreMessage.role === "user" || coreMessage.role === "system") {
      flushAssistant(state);
      state.groups.push({ role: coreMessage.role, message });
      continue;
    }

    // Assistant or tool message: start new group if order changes.
    if (state.hasCurrentOrder && message.order !== state.currentOrder) {
      flushAssistant(state);
    }

    state.currentOrder = message.order;
    state.hasCurrentOrder = true;
    state.currentGroup.push(message);

    // End group on an assistant message without tool calls.
    if (coreMessage.role === "assistant" && !message.tool) {
      flushAssistant(state);
    }
  }

  flushAssistant(state);
  return state.groups;
}

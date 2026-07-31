import { pick } from "convex-helpers";

import type { UIMessage } from "./types";
import { joinText } from "../shared";

/**
 * Combine adjacent assistant UIMessages that share the same `order`, merging
 * their parts and preferring non-undefined fields from the later message. Used
 * to fold streaming updates into the persisted messages.
 */
export function combineUIMessages(messages: UIMessage[]) {
  return messages.reduce<UIMessage[]>((acc, message) => {
    if (!acc.length) {
      return [message];
    }
    const previous = acc.at(-1);
    if (
      message.order !== previous?.order ||
      previous.role !== message.role ||
      message.role !== "assistant"
    ) {
      acc.push(message);
      return acc;
    }
    acc.pop();
    const newParts = mergePartsList(previous.parts, message.parts);
    acc.push({
      ...previous,
      ...pick(message, ["status", "metadata", "agentName"]),
      parts: newParts,
      text: joinText(newParts),
    });
    return acc;
  }, []);
}

function mergePartsList(
  previousParts: UIMessage["parts"],
  incomingParts: UIMessage["parts"],
) {
  const newParts = [...previousParts];
  for (const part of incomingParts) {
    const toolCallId = getToolCallId(part);
    if (!toolCallId) {
      newParts.push(part);
      continue;
    }
    const previousPartIndex = newParts.findIndex(
      (p) => getToolCallId(p) === toolCallId,
    );
    if (previousPartIndex === -1) {
      newParts.push(part);
      continue;
    }
    const [previousPart] = newParts.splice(previousPartIndex, 1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- features package enables noUncheckedIndexedAccess, which widens the splice destructure to undefined there even though it's guaranteed here
    if (!previousPart) continue;
    newParts.push(mergeParts(previousPart, part));
  }
  return newParts;
}

function getToolCallId(part: UIMessage["parts"][number]) {
  if ("toolCallId" in part && typeof part.toolCallId === "string") {
    return part.toolCallId;
  }
  return undefined;
}

function mergeParts(
  previousPart: UIMessage["parts"][number],
  part: UIMessage["parts"][number],
) {
  const merged = mergeIntoRecord({ ...previousPart }, part);
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- merged is a freshly-built tool part; the SDK union requires a cast to re-type
  return merged as UIMessage["parts"][number];
}

function mergeIntoRecord(base: Record<string, unknown>, part: object) {
  for (const [key, value] of Object.entries(part)) {
    if (value !== undefined) {
      base[key] = value;
    }
  }
  return base;
}

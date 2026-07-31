import type { Source } from "../../types/source";
import type { MyUIMessage, MyUIMessagePart } from "../types/message-types";
import { isUserVisible } from "../types/message-types";

export { extractTextFromChildren } from "./extract-text";

export function extractReasoningFromMessage(message: MyUIMessage) {
  return message.parts
    .filter((part) => part.type === "reasoning")
    .map((part) => part.text)
    .join("\n");
}

export function getLatestPartType(message: MyUIMessage) {
  if (message.parts.length === 0) return null;
  const lastPart = message.parts[message.parts.length - 1];
  if (!lastPart) return null;
  return lastPart.type;
}

const statusLabels = new Map<string, string>([
  ["tool-dateTime", "Checking the time"],
  ["tool-weather", "Checking the weather"],
  ["tool-currentEvents", "Checking the news"],
  ["tool-analyzeFiles", "Analyzing files"],
  ["tool-positionHolder", "Searching for information"],
  ["tool-initImage", "Generating image"],
  ["tool-generateImage", "Generating image"],
  ["tool-editImage", "Generating image"],
]);

export function getStatusLabel(parts: MyUIMessagePart[]) {
  const part = parts[parts.length - 1];
  if (!part) return "Reasoning";
  return statusLabels.get(part.type) ?? "Reasoning";
}

export function getVisibleErrors(message: MyUIMessage) {
  if (!message.errors) return [];
  return message.errors.filter((e) => isUserVisible(e.code));
}

function isSource(value: unknown): value is Source {
  if (typeof value !== "object" || value === null) return false;
  if (!("url" in value)) return false;
  return typeof value.url === "string";
}

export function extractSourcesFromMessage(message: MyUIMessage) {
  return message.parts.flatMap((part) => {
    if (
      part.type !== "tool-currentEvents" &&
      part.type !== "tool-positionHolder"
    ) {
      return [];
    }
    if (!part.output || typeof part.output !== "object") return [];
    if (!("sources" in part.output)) return [];
    const { sources } = part.output;
    if (!Array.isArray(sources)) return [];
    return sources.filter(isSource);
  });
}

export function extractImageFromMessage(message: MyUIMessage) {
  if (message.parts.length === 0) return null;
  const lastPart = message.parts[message.parts.length - 1];
  if (!lastPart) return null;
  if (lastPart.type === "tool-initImage") {
    return "in-progress";
  }
  const foundPart = message.parts.find(
    (part) =>
      part.type === "tool-generateImage" || part.type === "tool-editImage",
  );
  if (!foundPart || !("output" in foundPart)) return undefined;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- tool output is untyped, runtime shape is { key?: string }
  const output = foundPart.output as { key?: string } | undefined;
  return output?.key;
}

export function responseHasNoContent(message: MyUIMessage) {
  if (message.text.length > 0) return false;
  const reasoning = extractReasoningFromMessage(message);
  if (reasoning.length > 0) return false;
  const sources = extractSourcesFromMessage(message);
  if (sources.length > 0) return false;
  const image = extractImageFromMessage(message);
  if (image) return false;
  const errors = getVisibleErrors(message);
  if (errors.length > 0) return false;
  if (message.notices && message.notices.length > 0) return false;
  return true;
}

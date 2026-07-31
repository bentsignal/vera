import type { ModelMessage } from "ai";

import type { Message, MessageDoc } from "../validators";
import type { SerializedMessage } from "./types";
import {
  fromModelMessageContent,
  serializeContent,
  toModelMessageContent,
} from "./content";

// Async signature retained because callers `await` the result; if/when file
// uploads come back this hook is the natural place for them.
// eslint-disable-next-line @typescript-eslint/require-await
export async function serializeMessage(message: ModelMessage | Message) {
  const { content } = serializeContent(message.content);
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const serialized = {
    role: message.role,
    content,
    ...(message.providerOptions
      ? { providerOptions: message.providerOptions }
      : {}),
  } as SerializedMessage;
  return { message: serialized };
}

/**
 * Like serializeMessage, but doesn't save any files and is looser. For use on
 * the frontend / in synchronous environments.
 */
export function fromModelMessage(message: ModelMessage) {
  const content = fromModelMessageContent(message.content);
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return {
    role: message.role,
    content,
    ...(message.providerOptions
      ? { providerOptions: message.providerOptions }
      : {}),
  } as SerializedMessage;
}

export function serializeOrThrow(message: ModelMessage | Message) {
  const { content } = serializeContent(message.content);
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return {
    role: message.role,
    content,
    ...(message.providerOptions
      ? { providerOptions: message.providerOptions }
      : {}),
  } as SerializedMessage;
}

export function toModelMessage(message: SerializedMessage | ModelMessage) {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return {
    ...message,
    content: toModelMessageContent(message.content),
  } as ModelMessage;
}

export function docsToModelMessages(messages: MessageDoc[]) {
  return messages
    .map((m) => m.message)
    .filter((m) => !!m)
    .filter((m) => !!m.content.length)
    .map(toModelMessage);
}

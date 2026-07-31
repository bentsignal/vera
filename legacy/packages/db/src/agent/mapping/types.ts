import type {
  UIMessage as AIMessage,
  AssistantContent,
  ToolContent,
  UserContent,
} from "ai";

import type { Message } from "../validators";

export type AIMessageWithoutId = Omit<AIMessage, "id">;

export type SerializeUrlsAndUint8Arrays<T> = T extends URL
  ? string
  : T extends Uint8Array | ArrayBufferLike
    ? ArrayBuffer
    : T extends (infer Inner)[]
      ? SerializeUrlsAndUint8Arrays<Inner>[]
      : T extends Record<string, unknown>
        ? { [K in keyof T]: SerializeUrlsAndUint8Arrays<T[K]> }
        : T;

export type Content = UserContent | AssistantContent | ToolContent;
export type SerializedContent = Message["content"];
export type SerializedMessage = Message;

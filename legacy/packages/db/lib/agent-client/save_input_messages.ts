import type { ModelMessage } from "ai";

import type { Message } from "../../src/agent/validators";
import type { ActionCtx, Config } from "./types";
import { saveMessages } from "./messages";
import { getPromptArray } from "./search";

export async function saveInputMessages(
  ctx: ActionCtx,
  {
    threadId,
    userId,
    prompt,
    messages,
    ...args
  }: {
    prompt: string | (ModelMessage | Message)[] | undefined;
    messages: (ModelMessage | Message)[] | undefined;
    promptMessageId: string | undefined;
    userId: string | undefined;
    threadId: string;
    agentName?: string;
    storageOptions?: {
      saveMessages?: "all" | "promptAndOutput";
    };
  } & Pick<Config, "usageHandler" | "callSettings">,
) {
  const shouldSave = args.storageOptions?.saveMessages ?? "promptAndOutput";
  const promptArray = getPromptArray(prompt);

  const toSave = collectInputMessagesToSave({
    messages,
    promptArray,
    promptMessageId: args.promptMessageId,
    shouldSave,
  });
  const saved = await saveMessages(ctx, {
    threadId,
    userId,
    messages: [...toSave, { role: "assistant", content: [] }],
    metadata: [
      ...Array.from({ length: toSave.length }, () => ({})),
      { status: "pending" },
    ],
    failPendingSteps: !!args.promptMessageId,
    promptMessageId: args.promptMessageId,
  });
  const pendingMessage = saved.messages.at(-1);
  if (!pendingMessage) {
    throw new Error("saveInputMessages: pending message missing after save");
  }
  const lastInputMessage = toSave.length ? saved.messages.at(-2) : undefined;
  return {
    promptMessageId: lastInputMessage?._id ?? args.promptMessageId,
    pendingMessage,
    savedMessages: saved.messages.slice(0, -1),
  };
}

function collectInputMessagesToSave({
  messages,
  promptArray,
  promptMessageId,
  shouldSave,
}: {
  messages: (ModelMessage | Message)[] | undefined;
  promptArray: (ModelMessage | Message)[];
  promptMessageId: string | undefined;
  shouldSave: "all" | "promptAndOutput";
}) {
  if (promptMessageId) {
    // No inputs saved when a promptMessageId is provided.
    return [];
  }
  // eslint-disable-next-line no-restricted-syntax -- push targets need the element type on an empty array initializer
  const toSave: (ModelMessage | Message)[] = [];
  if (shouldSave === "all") {
    if (messages) toSave.push(...messages);
    toSave.push(...promptArray);
    return toSave;
  }
  if (promptArray.length) {
    toSave.push(...promptArray);
  } else if (messages) {
    toSave.push(...messages.slice(-1));
  }
  return toSave;
}

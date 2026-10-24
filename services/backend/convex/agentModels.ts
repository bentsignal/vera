import type { ModelMessage, ToolSet } from "ai";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { APICallError, generateText, wrapLanguageModel } from "ai";

import type { AssistantModel } from "../assistant-models";
import type { BotAccount } from "./bots";
import { GATEWAY_URL_IMAGES } from "../assistant-models";
import { NO_TOOL_CALL, replyOutcome } from "../reply-outcome";

// Calling the models for a reply (agent.ts), with Gemini taking over when
// Grok fails (assistant-models.ts).

/** Tries per model before the next one takes over. */
const TRIES = 2;

type ReplyOptions = Omit<
  Parameters<typeof generateText<ToolSet>>[0],
  "messages" | "model" | "prompt"
>;

/**
 * The model through the gateway. Images in formats the gateway can't fetch
 * from a URL (HEIC) are downloaded and sent inline instead.
 */
function gatewayModel(model: AssistantModel) {
  return wrapLanguageModel({
    middleware: {
      overrideSupportedUrls: () =>
        Object.fromEntries(
          GATEWAY_URL_IMAGES.map((type) => [type, [/^https?:\/\//]]),
        ),
      specificationVersion: "v4",
    },
    model: convexGateway(model.id, { zdr: true }),
  });
}

/** False when the provider says trying the same request again won't help. */
function worthRetrying(error: unknown) {
  return !APICallError.isInstance(error) || error.isRetryable;
}

/**
 * Runs the model for a reply: each model in `models` gets up to `TRIES`
 * (one when retrying won't help, such as a request it rejects), then the
 * next takes over, until something has been sent. It speaks only through
 * tools, and text it writes outside them is never sent, so a reply with
 * neither a message nor stay_quiet gets its turn back once, told why
 * (reply-outcome.ts).
 */
export async function generateReply(
  options: ReplyOptions,
  models: readonly { messages: ModelMessage[]; model: AssistantModel }[],
  sender: { sent: () => number },
  bot: BotAccount,
) {
  async function generate(more: ModelMessage[] = [], from = 0) {
    let failure: unknown;
    for (const [index, { messages, model }] of models.entries()) {
      if (index < from) continue;
      for (let attempt = 1; attempt <= TRIES; attempt += 1) {
        try {
          const result = await generateText({
            ...options,
            // The tries here replace the AI SDK's own.
            maxRetries: 0,
            messages: [...messages, ...more],
            model: gatewayModel(model),
          });
          return { index, model, result };
        } catch (error: unknown) {
          // Once something went out, another try would say it again.
          if (sender.sent() > 0) throw error;
          console.warn(`${bot.username} failed on ${model.id}`, error);
          failure = error;
          if (!worthRetrying(error)) break;
        }
      }
    }
    throw failure;
  }
  const first = await generate();
  if (replyOutcome(first.result.steps, sender.sent()) !== "noToolCall") {
    return [first.result];
  }
  console.warn(
    `${bot.username} answered without a tool call on ${first.model.id}`,
    first.result.text,
  );
  // From the model that answered, which is still up.
  const retry = await generate(
    [
      ...first.result.response.messages,
      { content: NO_TOOL_CALL, role: "system" },
    ],
    first.index,
  );
  if (replyOutcome(retry.result.steps, sender.sent()) === "noToolCall") {
    console.error(
      `${bot.username} again answered without a tool call on ${retry.model.id}`,
      retry.result.text,
    );
  }
  return [first.result, retry.result];
}

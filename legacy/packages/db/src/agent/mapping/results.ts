import type {
  GenerateObjectResult,
  ModelMessage,
  StepResult,
  ToolSet,
} from "ai";
import { parse } from "convex-helpers/validators";

import type { ModelOrMetadata } from "../shared";
import type { MessageWithMetadata } from "../validators";
import { getModelName, getProviderName } from "../shared";
import { vMessageWithMetadata } from "../validators";
import { serializeMessage } from "./messages";
import { serializeUsage, serializeWarnings } from "./usage";

interface SerializeStepArgs<TOOLS extends ToolSet> {
  step: StepResult<TOOLS>;
  model: ModelOrMetadata | undefined;
  messagesToSerialize: ModelMessage[];
}

interface SerializeNewMessagesArgs<TOOLS extends ToolSet> {
  step: StepResult<TOOLS>;
  model: ModelOrMetadata | undefined;
}

interface SerializeResponseArgs<
  TOOLS extends ToolSet,
> extends SerializeNewMessagesArgs<TOOLS> {
  responseMessages: ModelMessage[];
}

/**
 * Serialize explicitly provided response messages for a step. Used by the
 * streaming/generation loop where the caller tracks which messages are new
 * via slicing.
 */
export async function serializeResponseMessages<TOOLS extends ToolSet>(
  args: SerializeResponseArgs<TOOLS>,
) {
  const { responseMessages, ...rest } = args;
  return serializeStepMessages({
    ...rest,
    messagesToSerialize: responseMessages,
  });
}

/**
 * Serialize the new messages from a step using a heuristic to determine
 * which response messages are new (last 1-2 messages).
 */
export async function serializeNewMessagesInStep<TOOLS extends ToolSet>(
  args: SerializeNewMessagesArgs<TOOLS>,
) {
  const { step } = args;
  const hasToolMessage = step.response.messages.at(-1)?.role === "tool";
  const messagesToSerialize = pickNewResponseMessages(step, hasToolMessage);
  return serializeStepMessages({ ...args, messagesToSerialize });
}

function pickNewResponseMessages<TOOLS extends ToolSet>(
  step: StepResult<TOOLS>,
  hasToolMessage: boolean,
) {
  if (hasToolMessage) return step.response.messages.slice(-2);
  if (step.content.length) return step.response.messages.slice(-1);
  return [{ role: "assistant", content: [] }] satisfies ModelMessage[];
}

async function serializeStepMessages<TOOLS extends ToolSet>(
  args: SerializeStepArgs<TOOLS>,
) {
  const { step, model, messagesToSerialize } = args;
  // ref: https://github.com/vercel/ai/blob/main/packages/ai/src/generate-text/to-response-messages.ts#L120
  const hasToolMessage = step.response.messages.at(-1)?.role === "tool";
  const assistantFields = {
    model: model ? getModelName(model) : undefined,
    provider: model ? getProviderName(model) : undefined,
    providerMetadata: step.providerMetadata,
    reasoning: step.reasoningText,
    reasoningDetails: step.reasoning,
    usage: serializeUsage(step.usage),
    warnings: serializeWarnings(step.warnings),
    finishReason: step.finishReason,
    sources: hasToolMessage ? undefined : step.sources,
  } satisfies Omit<MessageWithMetadata, "message" | "text">;
  const toolFields = { sources: step.sources };

  // Annotation widens the inferred type so callers can push partial messages.
  // eslint-disable-next-line no-restricted-syntax
  const messages: MessageWithMetadata[] = await Promise.all(
    messagesToSerialize.map(async (msg) => {
      const { message } = await serializeMessage(msg);
      return parse(vMessageWithMetadata, {
        message,
        ...(message.role === "tool" ? toolFields : assistantFields),
        text: step.text,
      });
    }),
  );
  return { messages };
}

export async function serializeObjectResult(args: {
  result: GenerateObjectResult<unknown>;
  model: ModelOrMetadata | undefined;
}) {
  const { result, model } = args;
  const text = JSON.stringify(result.object);
  const { message } = await serializeMessage({
    role: "assistant",
    content: text,
  });
  // eslint-disable-next-line no-restricted-syntax
  const messages: MessageWithMetadata[] = [
    {
      message,
      model: model ? getModelName(model) : undefined,
      provider: model ? getProviderName(model) : undefined,
      providerMetadata: result.providerMetadata,
      finishReason: result.finishReason,
      text,
      usage: serializeUsage(result.usage),
      warnings: serializeWarnings(result.warnings),
    },
  ];
  return { messages };
}

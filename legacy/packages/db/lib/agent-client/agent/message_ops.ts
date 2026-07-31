import type {
  GenerateObjectResult,
  LanguageModel,
  ModelMessage,
  StepResult,
  ToolSet,
} from "ai";

import type {
  Message,
  MessageWithMetadata,
} from "../../../src/agent/validators";
import type { ActionCtx, MutationCtx } from "../types";
import { asId } from "../_ids";
import { internal } from "../../../src/_generated/api";
import {
  serializeMessage,
  serializeNewMessagesInStep,
  serializeObjectResult,
} from "../../../src/agent/mapping";
import { getModelName, getProviderName } from "../../../src/agent/shared";

interface ModelOpts {
  languageModel: LanguageModel;
}

export async function agentSaveStep<TOOLS extends ToolSet>(
  options: ModelOpts & { name: string },
  ctx: ActionCtx,
  args: {
    userId?: string;
    threadId: string;
    promptMessageId: string;
    step: StepResult<TOOLS>;
    model?: string;
    provider?: string;
  },
) {
  const { messages } = await serializeNewMessagesInStep({
    step: args.step,
    model: {
      provider: args.provider ?? getProviderName(options.languageModel),
      model: args.model ?? getModelName(options.languageModel),
    },
  });

  return ctx.runMutation(internal.agent.messages.addMessages, {
    userId: args.userId,
    threadId: asId<"threads">(args.threadId),
    agentName: options.name,
    promptMessageId: asId<"messages">(args.promptMessageId),
    messages,
    failPendingSteps: false,
  });
}

export async function agentSaveObject(
  options: ModelOpts & { name: string },
  ctx: ActionCtx,
  args: {
    userId: string | undefined;
    threadId: string;
    promptMessageId: string;
    model: string | undefined;
    provider: string | undefined;
    result: GenerateObjectResult<unknown>;
    metadata?: Omit<MessageWithMetadata, "message">;
  },
) {
  const { messages } = await serializeObjectResult({
    result: args.result,
    model: {
      model:
        args.model ??
        args.metadata?.model ??
        getModelName(options.languageModel),
      provider:
        args.provider ??
        args.metadata?.provider ??
        getProviderName(options.languageModel),
    },
  });

  return ctx.runMutation(internal.agent.messages.addMessages, {
    userId: args.userId,
    threadId: asId<"threads">(args.threadId),
    promptMessageId: asId<"messages">(args.promptMessageId),
    failPendingSteps: false,
    messages,
    agentName: options.name,
  });
}

export async function agentFinalizeMessage(
  ctx: MutationCtx | ActionCtx,
  args: {
    messageId: string;
    result: { status: "failed"; error: string } | { status: "success" };
  },
) {
  await ctx.runMutation(internal.agent.messages.finalizeMessage, {
    messageId: asId<"messages">(args.messageId),
    result: args.result,
  });
}

export async function agentUpdateMessage(
  ctx: MutationCtx | ActionCtx,
  args: {
    messageId: string;
    patch: {
      message: ModelMessage | Message;
      status: "success" | "error";
      error?: string;
    };
  },
) {
  const { message } = await serializeMessage(args.patch.message);
  await ctx.runMutation(internal.agent.messages.updateMessage, {
    messageId: asId<"messages">(args.messageId),
    patch: {
      message,
      status: args.patch.status === "success" ? "success" : "failed",
      error: args.patch.error,
    },
  });
}

export async function agentDeleteMessages(
  ctx: MutationCtx | ActionCtx,
  args: { messageIds: string[] },
) {
  await ctx.runMutation(internal.agent.messages.deleteByIds, {
    messageIds: args.messageIds.map((id) => asId<"messages">(id)),
  });
}

export async function agentDeleteMessage(
  ctx: MutationCtx | ActionCtx,
  args: { messageId: string },
) {
  await ctx.runMutation(internal.agent.messages.deleteByIds, {
    messageIds: [asId<"messages">(args.messageId)],
  });
}

export async function agentDeleteMessageRange(
  ctx: MutationCtx | ActionCtx,
  args: {
    threadId: string;
    startOrder: number;
    startStepOrder?: number;
    endOrder: number;
    endStepOrder?: number;
  },
) {
  return ctx.runMutation(internal.agent.messages.deleteByOrder, {
    threadId: asId<"threads">(args.threadId),
    startOrder: args.startOrder,
    startStepOrder: args.startStepOrder,
    endOrder: args.endOrder,
    endStepOrder: args.endStepOrder,
  });
}

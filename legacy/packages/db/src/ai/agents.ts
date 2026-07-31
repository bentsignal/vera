import { v } from "convex/values";

import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { Agent } from "../../lib/agent-client";
import { calculateModelCost } from "../user/usage";
import { isLanguageModelKey } from "./models/helpers";
import { languageModels } from "./models/language";
import { modelPresets } from "./models/presets";
import { agentPrompt } from "./prompts";
import { tools } from "./tools";

const agent = new Agent({
  languageModel: modelPresets.default.model,
  name: "The Thinker",
  instructions: agentPrompt,
  maxSteps: 20,
  tools: tools,
  contextOptions: {
    excludeToolMessages: false,
  },
  // maxRetries intentionally omitted: AI SDK replays the whole generation on
  // transient errors, including after a user abort (since abortById doesn't
  // throw — it silently stops writes). A replay re-streams text the user
  // already cancelled. If we ever need retries, gate them on a predicate that
  // returns false once wasAborted(ctx, threadId, generationId) is true.
  callSettings: { maxRetries: 0 },
  usageHandler: async (ctx, args) => {
    const { model: modelId, usage, providerMetadata } = args;
    // currently this won't work since the modelId will be like google/gemini-3-flash
    // and my model keys are just gemini-3-flash, so they don't match. it shouldn't matter
    // tho because it should be calculated based off of providerMetadata.
    const model = isLanguageModelKey(modelId)
      ? languageModels[modelId]
      : undefined;
    const cost = calculateModelCost({ model, usage, providerMetadata });
    await ctx.runMutation(internal.user.usage.log, {
      userId: args.userId ?? "no-user",
      type: "message",
      cost: cost,
    });
  },
});

export async function generateResponse(
  ctx: ActionCtx,
  prompt: string,
  title?: string,
  userId?: string,
) {
  const { GenerateResponseError } = await import("./stream/errors");
  let threadId: string;
  try {
    const createdThread = await agent.createThread(ctx, {
      title: title ?? "Response",
      userId,
    });
    threadId = createdThread.threadId;
  } catch (cause) {
    throw new GenerateResponseError({ cause, phase: "createThread" });
  }

  const { thread } = agent.continueThread(ctx, { threadId });
  try {
    const result = await thread.generateText({
      prompt,
      maxOutputTokens: 16000,
      providerOptions: {
        openrouter: { reasoning: { max_tokens: 8000 } },
      },
    });
    return result.text;
  } catch (cause) {
    console.error("generate-response failed", { cause });
    throw new GenerateResponseError({ cause, phase: "generateText" });
  }
}

export const streamResponse = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    model: v.optional(v.string()),
    generationId: v.string(),
    userId: v.string(),
    userPlan: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { runStreamResponse } = await import("./stream/program");
    await runStreamResponse(ctx, agent, args);
  },
});

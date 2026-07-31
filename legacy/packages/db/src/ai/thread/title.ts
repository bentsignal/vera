import { generateText } from "ai";
import { v } from "convex/values";

import { internal } from "../../_generated/api";
import { internalAction, internalMutation } from "../../_generated/server";
import { authedMutation, authedQuery } from "../../convex_helpers";
import { modelPresets } from "../models/presets";
import { titleGeneratorPrompt } from "../prompts";
import { authorizeAccess, saveNewTitle } from "./helpers";

export const get = authedQuery({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await authorizeAccess(ctx, args.threadId);
    return thread?.title;
  },
});

export const generate = internalAction({
  args: {
    prompt: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const { prompt, threadId } = args;
    const response = await generateText({
      model: modelPresets.titleGenerator.model,
      prompt,
      system: titleGeneratorPrompt,
    });
    await ctx.runMutation(internal.ai.thread.title.set, {
      threadId,
      title: response.text.trim(),
    });
  },
});

export const set = internalMutation({
  args: {
    title: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    await saveNewTitle({ ctx, threadId: args.threadId, title: args.title });
  },
});

export const rename = authedMutation({
  args: {
    name: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    await saveNewTitle({ ctx, threadId: args.threadId, title: args.name });
  },
});

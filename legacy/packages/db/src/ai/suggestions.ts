import { generateObject, generateText } from "ai";
import { v } from "convex/values";
import { z } from "zod";

import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server";
import { authedMutation } from "../convex_helpers";
import { counter } from "../counter";
import { limiter } from "../limiter";
import { languageModels } from "./models/language";
import { formatSuggestions, suggestionsGenerationPrompt } from "./prompts";

export const generate = internalAction({
  args: {},
  handler: async (ctx) => {
    // generate text containing prompts
    const { text: rawPrompts } = await generateText({
      model: languageModels.sonar.model,
      prompt: suggestionsGenerationPrompt,
    });
    // parse text into array of prompts
    const { object: prompts } = await generateObject({
      model: languageModels["gemini-2.0-flash"].model,
      prompt: rawPrompts,
      system: formatSuggestions,
      schema: z.object({
        prompts: z.array(z.string()).max(10),
      }),
    });
    // save new suggestions to table
    await ctx.runMutation(internal.ai.suggestions.save, {
      prompts: prompts.prompts,
    });
  },
});

export const save = internalMutation({
  args: {
    prompts: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    for (const prompt of args.prompts) {
      await ctx.db.insert("suggestions", { prompt });
    }
  },
});

export const incrementClickCount = authedMutation({
  args: {
    id: v.id("suggestions"),
  },
  handler: async (ctx, args) => {
    // no need to let user know if limit is hit. just don't want to increment
    // the counter if its being spammed
    const { ok } = await limiter.limit(ctx, "suggestion", {
      key: ctx.user.subject,
    });
    if (!ok) {
      return;
    }
    await counter.add(ctx, args.id, 1);
  },
});

export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("suggestions").order("desc").take(10);
  },
});

export const getTopWeekly = internalQuery({
  args: {
    numResults: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // get all suggestions generated in the last 7 days
    const now = new Date();
    const sevenDaysAgo = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 7,
    ).getTime();
    const suggestions = await ctx.db
      .query("suggestions")
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", sevenDaysAgo),
      )
      .order("desc")
      .collect();
    // count how many times each suggestion has been clicked
    const counts = await Promise.all(
      suggestions.map(async (suggestion) => {
        const count = await counter.count(ctx, suggestion._id);
        return {
          id: suggestion._id,
          prompt: suggestion.prompt,
          count,
        };
      }),
    );
    // sort by count and return the top clicked results
    return counts
      .sort((a, b) => b.count - a.count)
      .slice(0, args.numResults ?? counts.length);
  },
});

/**
 * Delete suggestions that are older than 1 month
 */
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const oneMonthAgoTime = oneMonthAgo.getTime();
    const suggestionsToDelete = await ctx.db
      .query("suggestions")
      .withIndex("by_creation_time", (q) =>
        q.lt("_creationTime", oneMonthAgoTime),
      )
      .collect();
    await Promise.all(
      suggestionsToDelete.map((suggestion) => ctx.db.delete(suggestion._id)),
    );
  },
});

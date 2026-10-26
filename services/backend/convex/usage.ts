import type { ProviderMetadata } from "ai";
import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { botName } from "./schema";

// What assistant replies cost: tokens and dollars per reply, from the AI
// Gateway's own numbers, plus Parallel's fee per search.

/** Parallel's Search API, fast mode: $1 per 1,000 requests. */
const SEARCH_COST = 0.001;

export interface Tally {
  memoryLookups: number;
  searches: number;
}

/** A reply's usage, from its `generateText` results (a retry makes two). */
export function usageOf(
  results: readonly {
    steps: readonly { providerMetadata: ProviderMetadata | undefined }[];
    totalUsage: {
      inputTokenDetails: { cacheReadTokens: number | undefined };
      inputTokens: number | undefined;
      outputTokens: number | undefined;
    };
  }[],
  tally: Tally,
) {
  const steps = results.flatMap((result) => result.steps);
  function total(tokens: "inputTokens" | "outputTokens") {
    return results.reduce(
      (sum, result) => sum + (result.totalUsage[tokens] ?? 0),
      0,
    );
  }
  const gatewayCost = steps.reduce((total, step) => {
    const cost: unknown = Reflect.get(
      Object(step.providerMetadata?.convexGateway),
      "cost",
    );
    return total + (typeof cost === "number" ? cost : 0);
  }, 0);
  return {
    cachedInputTokens: results.reduce(
      (sum, result) =>
        sum + (result.totalUsage.inputTokenDetails.cacheReadTokens ?? 0),
      0,
    ),
    cost: gatewayCost + tally.searches * SEARCH_COST,
    inputTokens: total("inputTokens"),
    memoryLookups: tally.memoryLookups,
    outputTokens: total("outputTokens"),
    searches: tally.searches,
    steps: steps.length,
  };
}

export const record = internalMutation({
  args: {
    accountId: v.string(),
    bot: botName,
    /** agent.ts `cachedPartHash`. */
    cachedPart: v.string(),
    cachedInputTokens: v.number(),
    conversationId: v.string(),
    cost: v.number(),
    inputTokens: v.number(),
    memoryLookups: v.number(),
    ms: v.number(),
    outputTokens: v.number(),
    searches: v.number(),
    steps: v.number(),
  },
  handler: async (ctx, { cachedPart, conversationId, ...usage }) => {
    const conversation = await ctx.db
      .query("botConversations")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId),
      )
      .unique();
    const previous = conversation?.cachedPart;
    if (conversation !== null && previous !== cachedPart) {
      await ctx.db.patch(conversation._id, { cachedPart });
    }
    await ctx.db.insert("assistantUsage", {
      ...usage,
      ...(previous !== undefined && {
        cachedPartChanged: previous !== cachedPart,
      }),
    });
  },
});

/**
 * Operator command: `npx convex run usage:summary '{"bot":"vera"}'`. Totals
 * and averages for the latest replies (500 by default).
 */
export const summary = internalQuery({
  args: { bot: botName, last: v.optional(v.number()) },
  handler: async (ctx, { bot, last }) => {
    const rows = await ctx.db
      .query("assistantUsage")
      .withIndex("by_bot", (q) => q.eq("bot", bot))
      .order("desc")
      .take(last ?? 500);
    function total(pick: (row: (typeof rows)[number]) => number) {
      return rows.reduce((sum, row) => sum + pick(row), 0);
    }
    const replies = Math.max(1, rows.length);
    const searched = rows.filter((row) => row.searches > 0);
    // Rows from before cached tokens were recorded don't count toward the rate.
    const measured = rows.filter((row) => row.cachedInputTokens !== undefined);
    // Nor do first replies, with nothing before them to compare.
    const followUps = rows.filter((row) => row.cachedPartChanged !== undefined);
    return {
      replies: rows.length,
      totalCost: total((row) => row.cost),
      averageCost: total((row) => row.cost) / replies,
      averageInputTokens: Math.round(total((row) => row.inputTokens) / replies),
      cacheHitRate:
        measured.reduce((sum, row) => sum + (row.cachedInputTokens ?? 0), 0) /
        Math.max(
          1,
          measured.reduce((sum, row) => sum + row.inputTokens, 0),
        ),
      // Replies whose instructions or tools changed since the last one in
      // their conversation, which the cache can't reuse past them. Filing a
      // report or saving a note does it; a high rate means something
      // changes every reply that belongs in `latest` (agent.ts `Prompt`).
      cachedPartChangeRate:
        followUps.filter((row) => row.cachedPartChanged === true).length /
        Math.max(1, followUps.length),
      averageSeconds: total((row) => row.ms) / replies / 1000,
      repliesThatSearched: searched.length,
      searches: total((row) => row.searches),
      averageCostWhenSearching:
        searched.reduce((sum, row) => sum + row.cost, 0) /
        Math.max(1, searched.length),
      memoryLookups: total((row) => row.memoryLookups),
    };
  },
});

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
    cost: v.number(),
    inputTokens: v.number(),
    memoryLookups: v.number(),
    ms: v.number(),
    outputTokens: v.number(),
    searches: v.number(),
    steps: v.number(),
  },
  handler: async (ctx, usage) => {
    await ctx.db.insert("assistantUsage", usage);
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
    return {
      replies: rows.length,
      totalCost: total((row) => row.cost),
      averageCost: total((row) => row.cost) / replies,
      averageInputTokens: Math.round(total((row) => row.inputTokens) / replies),
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

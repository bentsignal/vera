import { tool } from "ai";
import { v } from "convex/values";
import { z } from "zod/v4";

import type { Turn } from "./agentTools";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { optionalEnvironment } from "./lib";

// Vera's web search: Parallel's Search API (https://docs.parallel.ai), which
// returns short excerpts chosen for the question instead of whole pages, so
// little text reaches the model. Every search's excerpts are kept for a day
// (`webSearches`, cleared by crons.ts) so follow-up questions read them
// instead of searching again. Needs PARALLEL_API_KEY.

/** Results kept per search, and how much excerpt text across them. */
const MAX_RESULTS = 8;
const MAX_CHARS_KEPT = 24_000;
/** How much of that the model reads right away; the rest stays cached. */
const MAX_CHARS_SHOWN = 6_000;
/** How much a follow-up reads from all of a search's results at once. */
const MAX_CHARS_FOLLOW_UP = 8_000;
/**
 * One search per reply (a second only when the first found almost nothing),
 * so a search-hungry model can't run up a bill. The hourly reply limit
 * (rateLimits.ts) bounds the rest.
 */
const THIN_RESULTS = 2;
/** How long a search's results are kept for follow-ups. */
const KEEP_FOR = 24 * 60 * 60 * 1000;

interface WebResult {
  excerpts: string[];
  publishDate: string | null;
  title: string;
  url: string;
}

const webResult = v.object({
  excerpts: v.array(v.string()),
  publishDate: v.union(v.null(), v.string()),
  title: v.string(),
  url: v.string(),
});

async function parallelSearch(
  apiKey: string,
  question: string,
  queries: string[],
): Promise<WebResult[]> {
  const response = await fetch("https://api.parallel.ai/v1/search", {
    body: JSON.stringify({
      advanced_settings: { max_results: MAX_RESULTS },
      max_chars_total: MAX_CHARS_KEPT,
      mode: "fast",
      objective: question,
      search_queries: queries.slice(0, 3),
    }),
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(
      `Parallel search: ${String(response.status)} ${await response.text()}`,
    );
  }
  const body: unknown = await response.json();
  const results = read(body, "results");
  return (Array.isArray(results) ? results : []).map((result: unknown) => {
    const excerpts = read(result, "excerpts");
    const title = read(result, "title");
    const date = read(result, "publish_date");
    return {
      excerpts: Array.isArray(excerpts)
        ? excerpts.filter((text) => typeof text === "string")
        : [],
      publishDate: typeof date === "string" ? date : null,
      title: typeof title === "string" ? title : "",
      url: String(read(result, "url")),
    };
  });
}

/** The results as the model first sees them, within `MAX_CHARS_SHOWN`. */
export function digest(results: readonly WebResult[]) {
  const perResult = Math.floor(MAX_CHARS_SHOWN / Math.max(1, results.length));
  return results.map((result, index) => ({
    excerpt: result.excerpts.join(" … ").slice(0, perResult),
    n: index + 1,
    published: result.publishDate,
    title: result.title,
    url: result.url,
  }));
}

export function webTools(turn: Turn) {
  let searches = 0;
  let lastFound = 0;
  return {
    web_search: tool({
      description:
        "Search the web for current events, recent facts, or specifics you don't reliably know. Don't search for things you already know well. You get one search per reply, so put everything you need into it (up to three queries).",
      inputSchema: z.object({
        question: z
          .string()
          .describe("What you're trying to find out, as a full question."),
        queries: z
          .array(z.string())
          .describe("Two or three short keyword searches, 3-6 words each."),
      }),
      execute: async ({ question, queries }) => {
        const apiKey = optionalEnvironment("PARALLEL_API_KEY");
        if (apiKey === null) return "Web search isn't available right now.";
        if (searches >= 2 || (searches === 1 && lastFound >= THIN_RESULTS)) {
          return "No more searches in this reply. Answer from what you found, or say what you couldn't find.";
        }
        searches += 1;
        const results = await parallelSearch(apiKey, question, queries);
        lastFound = results.length;
        const searchId: string = await turn.ctx.runMutation(
          internal.webSearch.keep,
          {
            accountId: turn.accountId,
            conversationId: turn.conversationId,
            question,
            results,
          },
        );
        turn.counted("search");
        return { results: digest(results), searchId };
      },
    }),
    more_from_search: tool({
      description:
        "Read more of an earlier search's saved results in this conversation (no new search), for follow-up questions. Ask for one result by number when you know which one you need.",
      inputSchema: z.object({
        searchId: z.string(),
        n: z
          .number()
          .optional()
          .describe("One result's number; leave out for all of them."),
      }),
      execute: async ({ n, searchId }) => {
        const saved: { question: string; results: WebResult[] } | null =
          await turn.ctx.runQuery(internal.webSearch.saved, {
            conversationId: turn.conversationId,
            searchId,
          });
        if (saved === null) return "That search isn't saved anymore.";
        if (n !== undefined) {
          return saved.results[n - 1] ?? "No result with that number.";
        }
        // All of them at once, trimmed: a follow-up shouldn't cost more
        // than a new search.
        const each = Math.floor(MAX_CHARS_FOLLOW_UP / saved.results.length);
        return saved.results.map((result, index) => ({
          excerpt: result.excerpts.join(" … ").slice(0, each),
          n: index + 1,
          title: result.title,
        }));
      },
    }),
  };
}

/** This conversation's searches from the last day, for the instructions. */
export const recent = internalQuery({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }) => {
    const rows = await ctx.db
      .query("webSearches")
      .withIndex("by_conversation", (q) =>
        q
          .eq("conversationId", conversationId)
          .gt("_creationTime", Date.now() - KEEP_FOR),
      )
      .order("desc")
      .take(5);
    return rows.map((row) => ({
      at: row._creationTime,
      id: row._id,
      question: row.question,
      sources: row.results.slice(0, 4).map((result) => result.title),
    }));
  },
});

export const keep = internalMutation({
  args: {
    accountId: v.string(),
    conversationId: v.string(),
    question: v.string(),
    results: v.array(webResult),
  },
  handler: (ctx, args) => ctx.db.insert("webSearches", args),
});

export const saved = internalQuery({
  args: { conversationId: v.string(), searchId: v.string() },
  handler: async (ctx, { conversationId, searchId }) => {
    const id = ctx.db.normalizeId("webSearches", searchId);
    const row = id === null ? null : await ctx.db.get(id);
    // Only this conversation's own searches.
    if (row?.conversationId !== conversationId) return null;
    return { question: row.question, results: row.results };
  },
});

/** Clears searches older than a day (crons.ts). */
export const clearOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query("webSearches")
      .withIndex("by_creation_time", (q) =>
        q.lt("_creationTime", Date.now() - KEEP_FOR),
      )
      .take(500);
    await Promise.all(old.map((row) => ctx.db.delete(row._id)));
    if (old.length === 500) {
      await ctx.scheduler.runAfter(0, internal.webSearch.clearOld, {});
    }
  },
});

function read(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, name)
    : undefined;
}

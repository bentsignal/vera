import { z } from "zod";

import type { ToolCtx } from "../../agent/tools";
import { internal } from "../../_generated/api";
import { env } from "../../convex.env";

const exaSearchResponseSchema = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string().nullable(),
      text: z.string(),
      favicon: z.string().optional(),
      image: z.string().optional(),
    }),
  ),
});

interface ExaSearchOptions {
  numResults: number;
  text: { maxCharacters: number };
  excludeDomains?: string[];
}

export async function exaSearchAndContents(
  query: string,
  opts: ExaSearchOptions,
) {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.EXA_API_KEY,
    },
    body: JSON.stringify({
      query,
      numResults: opts.numResults,
      contents: { text: { maxCharacters: opts.text.maxCharacters } },
      excludeDomains: opts.excludeDomains,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Exa search failed: ${res.status.toString()} ${res.statusText}`,
    );
  }
  return exaSearchResponseSchema.parse(await res.json());
}

export async function logSearchCost(
  ctx: ToolCtx,
  numResults: number,
  userId: string,
) {
  const baseSearchCost = 0.005; // $5 / 1000 searches
  const contentsCost = numResults * 0.001; // $ 1 / 1000 pages retrieved
  const totalCost = baseSearchCost + contentsCost;
  await ctx.runMutation(internal.user.usage.log, {
    userId: userId,
    type: "tool_call",
    cost: totalCost,
  });
}

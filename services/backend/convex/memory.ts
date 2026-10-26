import type { Message } from "@decentralized-convex/messages";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { embed, tool } from "ai";
import { v } from "convex/values";
import { z } from "zod/v4";

import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import type { Turn } from "./agentTools";
import type { BotAccount } from "./bots";
import type { Tally } from "./usage";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { botAddress } from "./bots";

// Vera's memory of the whole conversation, beyond the 40 messages it sees:
// every exchange (2 messages) becomes a passage, embedded once and found again by
// meaning (Convex vector search), both before each reply (`recallFor`) and
// with the `search_memory` tool. Only that one conversation's passages are
// ever searched. Editing or deleting a message rebuilds its passage, so
// nothing deleted stays remembered.

/**
 * Messages per passage: one exchange. In a benchmark on a 320-message
 * conversation, 2 matched better than 4, and 4 better than 10 (which
 * blurred several topics into one embedding).
 */
export const PASSAGE_SIZE = 2;
/**
 * The least similarity a passage needs to be recalled on its own. In the
 * benchmark, the right passages scored 0.25 to 0.65 and unrelated ones
 * mostly under 0.25.
 */
const RECALL_SCORE = 0.25;
/** Passages recalled before a reply, from this many closest candidates. */
const RECALLED = 3;
const CANDIDATES = 16;
/** Passages a lookup returns. */
const RESULTS = 4;

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
/** text-embedding-3-small shortened to 512 dimensions: a third the storage. */
export const DIMENSIONS = 512;

export function embeddingModel() {
  return convexGateway.embeddingModel(EMBEDDING_MODEL, { zdr: true });
}

export const dimensions = {
  convexGateway: { dimensions: DIMENSIONS },
  openaiCompatible: { dimensions: DIMENSIONS },
};

export function memoryTools(turn: Turn) {
  return {
    search_memory: tool({
      description:
        "Search everything said in this conversation, including what's too old for you to see, by meaning. Use it when they refer to something from earlier that isn't in front of you.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("What you're looking for, in a few words or a sentence."),
      }),
      execute: async ({ query }) => {
        turn.counted("memory");
        const found = distinct(
          await recall(turn.ctx, turn.conversationId, query, CANDIDATES),
        ).slice(0, RESULTS);
        if (found.length === 0) return "Nothing found.";
        return found
          .sort((a, b) => a.lastSentAt - b.lastSentAt)
          .map((passage) => passage.text);
      },
    }),
  };
}

/**
 * The passages of this conversation closest in meaning to `query`, best
 * first, with their scores (cosine similarity, -1 to 1).
 */
export async function recall(
  ctx: ActionCtx,
  conversationId: string,
  query: string,
  limit = RESULTS,
) {
  // Photo-only messages have no text to embed. The reply still sees the photo.
  if (query.trim().length === 0) return [];
  const { embedding } = await embed({
    model: embeddingModel(),
    providerOptions: dimensions,
    value: query,
  });
  const found = await ctx.vectorSearch("memoryPassages", "by_embedding", {
    filter: (q) => q.eq("conversationId", conversationId),
    limit,
    vector: embedding,
  });
  const rows: { id: Id<"memoryPassages">; lastSentAt: number; text: string }[] =
    await ctx.runQuery(internal.memory.passages, {
      ids: found.map((result) => result._id),
    });
  return rows.map((row) => ({
    ...row,
    score: found.find((result) => result._id === row.id)?._score ?? 0,
  }));
}

export const passages = internalQuery({
  args: { ids: v.array(v.id("memoryPassages")) },
  handler: async (ctx, { ids }) => {
    const rows = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return rows
      .filter((row): row is Doc<"memoryPassages"> => row !== null)
      .map((row) => ({
        id: row._id,
        lastSentAt: row.lastSentAt,
        text: row.text,
      }));
  },
});

/**
 * Drops passages that say the same thing as a better match (the same
 * words on another day), so repeats can't crowd out everything else.
 */
function distinct<Passage extends { text: string }>(passages: Passage[]) {
  const seen = new Set<string>();
  return passages.filter((passage) => {
    const words = passage.text.replace(/^\[[^\]]*\] /gm, "").toLowerCase();
    if (seen.has(words)) return false;
    seen.add(words);
    return true;
  });
}

/**
 * Before a reply: what from older parts of the conversation (before
 * `visibleFrom`, the oldest message the model sees) closely matches the
 * person's new messages.
 */
export async function recallFor(
  ctx: ActionCtx,
  conversationId: string,
  newMessages: string,
  visibleFrom: number,
) {
  const found = distinct(
    await recall(ctx, conversationId, newMessages, CANDIDATES),
  );
  return (
    found
      .filter(
        (passage) =>
          passage.score >= RECALL_SCORE && passage.lastSentAt < visibleFrom,
      )
      .slice(0, RECALLED)
      // Oldest first, so a fact that changed reads in the order it changed.
      .sort((a, b) => a.lastSentAt - b.lastSentAt)
      .map((passage) => passage.text)
  );
}

/**
 * Vera's recall of older parts of the conversation that match the person's
 * new messages (memory.ts). Skipped when the model sees the whole thing.
 */
export async function recallOlder(
  ctx: ActionCtx,
  bot: BotAccount,
  conversationId: string,
  {
    answeredThrough,
    hasOlder,
    history,
    tally,
  }: {
    answeredThrough: number | null;
    hasOlder: boolean;
    history: readonly Message[];
    tally: Tally;
  },
) {
  const visibleFrom = history.at(0)?.sentAt;
  if (!hasOlder || visibleFrom === undefined) {
    return [];
  }
  const self = botAddress(bot);
  const newMessages = history
    .filter(
      (message) =>
        message.authorId !== self && message.sentAt > (answeredThrough ?? 0),
    )
    .map((message) => message.body)
    .join("\n");
  if (newMessages.trim().length === 0) return [];
  tally.memoryLookups += 1;
  return recallFor(ctx, conversationId, newMessages, visibleFrom);
}

/** Operator/testing: `npx convex run memory:probe '{"conversationId":"…","query":"…"}'`. */
export const probe = internalAction({
  args: { conversationId: v.string(), query: v.string() },
  handler: async (ctx, { conversationId, query }) =>
    (await recall(ctx, conversationId, query, 6)).map((passage) => ({
      score: Number(passage.score.toFixed(3)),
      start: passage.text.slice(0, 120),
    })),
});

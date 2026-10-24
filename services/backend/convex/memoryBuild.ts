import type { Message } from "@decentralized-convex/messages";
import { embedMany } from "ai";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import type { BotAccount } from "./bots";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { botAccount, botAddress } from "./bots";
import { dimensions, DIMENSIONS, embeddingModel, PASSAGE_SIZE } from "./memory";
import { botName } from "./schema";

// Building Vera's memory (memory.ts): passages of 2 messages, made as a
// conversation grows and rebuilt when a message in one is edited or deleted.

/** How far back a first pass reads, in pages of 50 messages. */
const MAX_PAGES = 100;

/** A passage's text: who said what, when. */
export function passageText(messages: readonly Message[], self: string) {
  return messages
    .map((message) => {
      const date = new Date(message.sentAt).toISOString().slice(0, 10);
      const who = message.authorId === self ? "Vera" : message.authorName;
      const attachments = message.attachments.map(
        (attachment) => ` [${attachment.kind}]`,
      );
      return `[${date}] ${who}: ${message.body}${attachments.join("")}`;
    })
    .join("\n");
}

/** The newest passage's last message time, or 0 before the first. */
export const coveredThrough = internalQuery({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }) => {
    const newest = await ctx.db
      .query("memoryPassages")
      .withIndex("by_conversation_last", (q) =>
        q.eq("conversationId", conversationId),
      )
      .order("desc")
      .first();
    return newest?.lastSentAt ?? 0;
  },
});

/** Messages after `after`, oldest first, read back from the newest. */
async function messagesAfter(
  ctx: ActionCtx,
  bot: BotAccount,
  conversationId: string,
  after: number,
  before?: number,
) {
  const found: Message[] = [];
  let cursor = before;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result: { hasOlder: boolean; messages: Message[] } =
      await ctx.runQuery(internal.bots.page, {
        before: cursor,
        bot: bot.username,
        conversationId,
      });
    const newer = result.messages.filter((message) => message.sentAt > after);
    found.unshift(...newer);
    const oldest = result.messages.at(0);
    if (!result.hasOlder || oldest === undefined || oldest.sentAt <= after) {
      break;
    }
    cursor = oldest.sentAt;
  }
  return found.filter((message) => message.deletedAt === undefined);
}

/**
 * Turns every complete run of 10 messages since the last passage into a
 * new one. Scheduled after each of Vera's replies (agent.ts); the newest
 * few messages wait until there are 10, which the model sees anyway.
 */
export const update = internalAction({
  args: { bot: botName, conversationId: v.string() },
  handler: async (ctx, { bot, conversationId }) => {
    const account = botAccount(bot);
    const after: number = await ctx.runQuery(
      internal.memoryBuild.coveredThrough,
      {
        conversationId,
      },
    );
    const messages = await messagesAfter(ctx, account, conversationId, after);
    const windows: Message[][] = [];
    for (let start = 0; start + PASSAGE_SIZE <= messages.length; ) {
      windows.push(messages.slice(start, start + PASSAGE_SIZE));
      start += PASSAGE_SIZE;
    }
    if (windows.length === 0) return;
    const self = botAddress(account);
    const texts = windows.map((window) => passageText(window, self));
    const { embeddings } = await embedMany({
      model: embeddingModel(),
      providerOptions: dimensions,
      values: texts,
    });
    await ctx.runMutation(internal.memoryBuild.save, {
      bot,
      conversationId,
      passages: windows.map((window, index) => ({
        embedding: embeddings[index] ?? [],
        firstSentAt: window[0]?.sentAt ?? 0,
        lastSentAt: window.at(-1)?.sentAt ?? 0,
        messageIds: window.map((message) => message.messageId),
        text: texts[index] ?? "",
      })),
    });
  },
});

const passage = v.object({
  embedding: v.array(v.float64()),
  firstSentAt: v.number(),
  lastSentAt: v.number(),
  messageIds: v.array(v.string()),
  text: v.string(),
});

export const save = internalMutation({
  args: {
    bot: botName,
    conversationId: v.string(),
    passages: v.array(passage),
    replacing: v.optional(v.id("memoryPassages")),
  },
  handler: async (ctx, { bot, conversationId, passages, replacing }) => {
    if (replacing !== undefined) await forgetPassage(ctx, replacing);
    for (const { messageIds, ...rest } of passages) {
      if (rest.embedding.length !== DIMENSIONS) continue;
      const passageId = await ctx.db.insert("memoryPassages", {
        ...rest,
        bot,
        conversationId,
      });
      await Promise.all(
        messageIds.map((messageId) =>
          ctx.db.insert("memoryLinks", { messageId, passageId }),
        ),
      );
    }
  },
});

async function forgetPassage(
  ctx: Pick<MutationCtx, "db">,
  passageId: Id<"memoryPassages">,
) {
  const links = await ctx.db
    .query("memoryLinks")
    .withIndex("by_passage", (q) => q.eq("passageId", passageId))
    .collect();
  await Promise.all(links.map((link) => ctx.db.delete(link._id)));
  if ((await ctx.db.get(passageId)) !== null) await ctx.db.delete(passageId);
}

/** The passage a message is in, if it's in one yet. */
export const passageOf = internalQuery({
  args: { messageId: v.string() },
  handler: async (ctx, { messageId }) => {
    const link = await ctx.db
      .query("memoryLinks")
      .withIndex("by_message", (q) => q.eq("messageId", messageId))
      .first();
    return link === null ? null : await ctx.db.get(link.passageId);
  },
});

/**
 * Rebuilds the passage holding an edited or deleted message from what the
 * conversation says now (bots.ts schedules it), or drops it when its
 * messages are all gone.
 */
export const rebuild = internalAction({
  args: { messageId: v.string() },
  handler: async (ctx, { messageId }) => {
    const old: Doc<"memoryPassages"> | null = await ctx.runQuery(
      internal.memoryBuild.passageOf,
      { messageId },
    );
    if (old === null) return;
    const account = botAccount(old.bot);
    const messages = await messagesAfter(
      ctx,
      account,
      old.conversationId,
      old.firstSentAt - 1,
      old.lastSentAt + 1,
    );
    const texts =
      messages.length === 0 ? [] : [passageText(messages, botAddress(account))];
    const { embeddings } =
      texts.length === 0
        ? { embeddings: [] }
        : await embedMany({
            model: embeddingModel(),
            providerOptions: dimensions,
            values: texts,
          });
    await ctx.runMutation(internal.memoryBuild.save, {
      bot: old.bot,
      conversationId: old.conversationId,
      passages: texts.map((text, index) => ({
        embedding: embeddings[index] ?? [],
        firstSentAt: old.firstSentAt,
        lastSentAt: old.lastSentAt,
        messageIds: messages.map((message) => message.messageId),
        text,
      })),
      replacing: old._id,
    });
  },
});

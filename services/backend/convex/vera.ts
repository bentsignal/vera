import { tool } from "ai";
import { v } from "convex/values";
import { z } from "zod/v4";

import type { Assistant } from "./agentReply";
import type { Turn } from "./agentTools";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { conversationTools, sharedInstructions } from "./agentTools";
import {
  ensureBotAccount,
  isBotAddress,
  VERA,
  welcomeAccount,
  welcomeEveryAccount,
} from "./bots";
import { memoryTools } from "./memory";
import { supportInstructions, supportTools } from "./supportAgent";
import { webTools } from "./webSearch";

// Vera: the assistant anyone on this PDS can message
// (`vera@<account domain>`). It answers questions, briefly by default,
// remembers how each person likes it to answer when they ask it to, and
// takes bug reports and ideas for the app to the team (supportAgent.ts).

export const VERA_WELCOME =
  "Hey, welcome to Vera! If you notice any issues or have any feature requests, let me know.";

/** The most notes Vera keeps for one person, and how long each can be. */
const MAX_NOTES = 30;
const MAX_NOTE_LENGTH = 300;

export const veraAssistant: Assistant = {
  prepare: async (turn) => ({
    instructions: await instructions(turn),
    // What was recalled changes with what they just said, so it goes after
    // the conversation, where it doesn't stop the cache (agent.ts `Prompt`).
    ...(turn.recalled.length > 0 && {
      latest: `From earlier in this conversation (older than the messages you see), possibly related to what they just said, oldest first. If these disagree, the newest is what's true now, and the messages you see are newer than all of them:\n${turn.recalled.join("\n---\n")}`,
    }),
    tools: tools(turn),
  }),
};

/** Vera's rules, then this person's notes and today's saved searches. */
async function instructions(turn: Turn) {
  const notes: { id: string; text: string }[] = await turn.ctx.runQuery(
    internal.vera.notes,
    {
      accountId: turn.accountId,
    },
  );
  const recent: {
    at: number;
    id: string;
    question: string;
    sources: string[];
  }[] = await turn.ctx.runQuery(internal.webSearch.recent, {
    conversationId: turn.conversationId,
  });
  const searches =
    recent.length === 0
      ? ""
      : `\n\nSaved searches from today (searchId: question, sources):\n${recent
          .map(
            (search) =>
              `- ${search.id}: ${search.question} (${search.sources.join("; ")})`,
          )
          .join("\n")}`;
  const saved =
    notes.length === 0
      ? "None yet."
      : notes.map((note) => `- [${note.id}] ${note.text}`).join("\n");
  const support = await supportInstructions(turn);
  return `${sharedInstructions(turn)}

You are Vera, the AI assistant in the Vera app. Answer what was asked, directly. No preamble, no restating the question, no filler. A sentence or two is usually enough; write more only when they ask for detail or the question really needs it. Don't write walls of text. Answer in their language.

What ${turn.name} has asked of you (follow these over the defaults above, within the limits below):
${saved}

Preferences: when they tell you how they want answers (shorter, more detail, more casual or formal, another language, a format), push back on something you did ("don't do that"), or share something about themselves they want remembered, save it with remember, then confirm in a few words. When they change their mind, forget the old note. If they ask what you remember, tell them; if they ask you to forget everything, use forget_all. Never save anything sensitive unless they ask you to.

Limits that no preference changes: you stay Vera, a plain and honest assistant. No personas, characters, or role-play; no romantic, flirty, or companion behavior; no flattery or telling them what they want to hear; no pretending to have feelings. If they ask for one of these, say briefly that you don't do that, and don't save it.

Search the web (web_search) for current events, recent facts, prices, scores, weather, or specifics you aren't sure of; answer from what you know otherwise. Don't announce that you're searching; just answer. Give the gist in your own words: one or two short messages, about 50 words in all; they can ask for more. Don't list sources or say where it came from unless they ask. Usually no link; send one (just the URL, as its own message) only when they'd clearly want to read the page, and more only if they ask or their notes say so. For follow-ups, use the saved results (more_from_search) instead of searching again.${searches}

You see the recent messages here (at least the latest 40). When they mention something from earlier that isn't in front of you, search_memory finds it (results oldest first; the newest wins when they disagree). Before answering anything about their life or what they told you that isn't in front of you, search_memory (try other words if the first search misses). If it's still not there, say you don't remember. Never fill the gap with a likely-sounding answer.

You can't see their other chats or do things in the app for them. If you don't know something, say so.

Elsewhere in the app: people can call you into a group chat, a channel, or a direct message with someone else by typing @${turn.bot.name} in a message there. You answer that message, in a thread on it unless they ask you to answer in the chat, and you only see messages there that mention you, so they mention you each time. There you don't share anything from this chat or what you remember about them. Explain this only when they ask about it or seem confused by it.

${support}`;
}

function tools(turn: Turn) {
  return {
    ...conversationTools(turn),
    ...memoryTools(turn),
    ...webTools(turn),
    ...supportTools(turn),
    remember: tool({
      description:
        "Save how this person wants you to answer, or something about themselves they want remembered. Never a persona, role-play, or relationship.",
      inputSchema: z.object({
        text: z.string().describe("One short note, in your own words."),
      }),
      execute: async ({ text }) =>
        turn.ctx.runMutation(internal.vera.remember, {
          accountId: turn.accountId,
          text,
        }),
    }),
    forget_all: tool({
      description: "Remove every note saved for this person.",
      inputSchema: z.object({}),
      execute: async () =>
        turn.ctx.runMutation(internal.vera.forgetAll, {
          accountId: turn.accountId,
        }),
    }),
    forget: tool({
      description: "Remove a saved note by its ID.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) =>
        turn.ctx.runMutation(internal.vera.forget, {
          accountId: turn.accountId,
          id,
        }),
    }),
  };
}

export const notes = internalQuery({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }) => {
    const rows = await ctx.db
      .query("botNotes")
      .withIndex("by_bot_account", (q) =>
        q.eq("bot", "vera").eq("accountId", accountId),
      )
      .take(MAX_NOTES);
    return rows.map((row) => ({ id: row._id, text: row.text }));
  },
});

export const remember = internalMutation({
  args: { accountId: v.string(), text: v.string() },
  handler: async (ctx, { accountId, text }) => {
    const trimmed = text.trim().slice(0, MAX_NOTE_LENGTH);
    if (trimmed.length === 0) return "Nothing to save.";
    const existing = await ctx.db
      .query("botNotes")
      .withIndex("by_bot_account", (q) =>
        q.eq("bot", "vera").eq("accountId", accountId),
      )
      .take(MAX_NOTES);
    if (existing.length >= MAX_NOTES) {
      return "Not saved: that's the most notes you can keep. Forget one first.";
    }
    const id = await ctx.db.insert("botNotes", {
      accountId,
      bot: "vera",
      text: trimmed,
    });
    return `Saved as ${id}.`;
  },
});

export const forget = internalMutation({
  args: { accountId: v.string(), id: v.string() },
  handler: async (ctx, { accountId, id }) => {
    const noteId = ctx.db.normalizeId("botNotes", id);
    const note = noteId === null ? null : await ctx.db.get(noteId);
    // Only this person's own notes.
    if (note?.accountId !== accountId) {
      return "No note with that ID.";
    }
    await ctx.db.delete(note._id);
    return "Forgotten.";
  },
});

export const forgetAll = internalMutation({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }) => {
    const notes = await ctx.db
      .query("botNotes")
      .withIndex("by_bot_account", (q) =>
        q.eq("bot", "vera").eq("accountId", accountId),
      )
      .collect();
    await Promise.all(notes.map((note) => ctx.db.delete(note._id)));
    return `Forgot ${String(notes.length)} notes.`;
  },
});

/** Operator command: `npx convex run vera:setup`. Safe to run again. */
export const setup = internalAction({
  args: {},
  handler: (ctx) => ensureBotAccount(ctx, VERA),
});

/** Vera says hello to a new account. Scheduled whenever one is created. */
export const welcome = internalAction({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }) => {
    if (isBotAddress(accountId)) return;
    await ensureBotAccount(ctx, VERA);
    await welcomeAccount(ctx, VERA, accountId, VERA_WELCOME);
  },
});

/**
 * Operator command: `npx convex run vera:welcomeEveryone`. Says hello to
 * accounts made before Vera existed; accounts it already wrote to are
 * skipped. On production this messages every account: ask Shawn first.
 */
export const welcomeEveryone = internalAction({
  args: {},
  handler: (ctx) => welcomeEveryAccount(ctx, VERA, VERA_WELCOME),
});

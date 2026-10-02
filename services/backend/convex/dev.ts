import type { FunctionArgs } from "convex/server";
import { DECENTRALIZED_CONVEX_VERSION } from "@decentralized-convex/core";
import { ConvexError, v } from "convex/values";

import type { ActionCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { devToolsEnabled } from "./devSignIn";
import { requireEnvironment } from "./lib";

// Development only. Bots are ordinary accounts on the dev deployment that
// post through the Messages plugin as themselves, so screens show other
// people without anyone making accounts by hand. Every entry point refuses to
// run unless DEV_TOOLS is "true", which production never sets.

const BOTS = [
  { name: "Maya Chen", username: "maya" },
  { name: "Jonah Weiss", username: "jonah" },
  { name: "Priya Natarajan", username: "priya" },
  { name: "Leo Martins", username: "leo" },
] as const;

const REPLIES = [
  "haha yes",
  "wait really?",
  "I'm in",
  "omw",
  "can't tonight, tomorrow?",
  "that's so good",
  "lol",
  "send pics",
  "ok but who's driving",
  "agreed 100%",
  "hmm let me think about it",
  "did you see this? https://github.com/expo/expo",
  "👀",
  "Totally forgot about that, thanks for the reminder. I'll look at it after work and get back to you tonight.",
];

type Operation = FunctionArgs<
  typeof components.messages.dispatcher.dispatchMutation
>["operation"];
type QueryOperation = FunctionArgs<
  typeof components.messages.dispatcher.dispatchQuery
>["operation"];

function pick<Value>(values: readonly Value[], seed: number) {
  const value = values[Math.abs(seed) % values.length];
  if (value === undefined) throw new Error("Nothing to pick from");
  return value;
}

function requireDevTools() {
  if (!devToolsEnabled()) {
    throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
  }
}

function botAddress(username: string) {
  return `${username}@${requireEnvironment("FEDERATION_DOMAIN")}`;
}

function identityFor(accountId: string, name: string) {
  return {
    accountId,
    issuer: "vera-dev",
    name,
    subject: accountId,
    tokenIdentifier: `vera-dev|${accountId}`,
  };
}

const request = {
  lastChanged: DECENTRALIZED_CONVEX_VERSION,
  version: DECENTRALIZED_CONVEX_VERSION,
} as const;

async function asAccount(
  ctx: ActionCtx,
  identity: ReturnType<typeof identityFor>,
  operation: Operation,
) {
  const response = await ctx.runMutation(
    components.messages.dispatcher.dispatchMutation,
    { ...request, identity, operation },
  );
  return response.value;
}

async function queryAs(
  ctx: ActionCtx,
  identity: ReturnType<typeof identityFor>,
  operation: QueryOperation,
) {
  const response = await ctx.runQuery(
    components.messages.dispatcher.dispatchQuery,
    { ...request, identity, operation },
  );
  return response.value;
}

async function requireCaller(ctx: ActionCtx) {
  requireDevTools();
  const identity = await ctx.auth.getUserIdentity();
  const accountId =
    typeof identity?.accountId === "string" ? identity.accountId : null;
  if (identity === null || accountId === null) {
    throw new ConvexError({ code: "AUTHENTICATED_ACCOUNT_REQUIRED" });
  }
  return identityFor(accountId, identity.name ?? accountId);
}

function botIdentity(bot: (typeof BOTS)[number]) {
  return identityFor(botAddress(bot.username), bot.name);
}

/** A believable back-and-forth spread over past days, oldest first. */
function history(
  authors: readonly { address: string; name: string }[],
  count: number,
  days: number,
) {
  const start = Date.now() - days * 24 * 60 * 60 * 1000;
  const step = (days * 24 * 60 * 60 * 1000) / count;
  return Array.from({ length: count }, (_, index) => {
    const author = pick(authors, Math.floor(index / 3) + index * 7);
    const withImage = index % 37 === 5;
    return {
      attachments: withImage
        ? [
            {
              height: 600,
              kind: "image" as const,
              mimeType: "image/jpeg",
              name: "photo.jpg",
              size: 120_000,
              url: `https://picsum.photos/seed/vera-${index}/800/600`,
              width: 800,
            },
          ]
        : [],
      authorId: author.address,
      authorName: author.name,
      body: withImage ? "" : `${pick(REPLIES, index * 13 + 5)} (#${index + 1})`,
      messageId: crypto.randomUUID(),
      sentAt: Math.round(start + index * step),
    };
  });
}

async function importHistory(
  ctx: ActionCtx,
  conversationId: string,
  messages: ReturnType<typeof history>,
) {
  // Keep each mutation small.
  for (let start = 0; start < messages.length; start += 100) {
    await ctx.runMutation(components.messages.history.importHistory, {
      conversationId,
      messages: messages.slice(start, start + 100),
    });
  }
}

/** Creates bot profiles and conversations with the signed-in account. */
export const seed = action({
  args: {},
  handler: async (ctx) => {
    const me = await requireCaller(ctx);
    const meAuthor = { address: me.accountId, name: me.name };
    const bots = BOTS.map(botIdentity);
    const authors = BOTS.map((bot) => ({
      address: botAddress(bot.username),
      name: bot.name,
    }));
    for (const bot of BOTS) {
      await ctx.runMutation(components.accounts.dispatcher.dispatchMutation, {
        ...request,
        identity: botIdentity(bot),
        operation: {
          args: { avatarUrl: null, displayName: bot.name },
          type: "upsertMyProfile",
        },
      });
    }

    // A very long DM for list and pagination testing, and short ones.
    for (const [index, bot] of bots.entries()) {
      const { conversationId } = await asAccount(ctx, bot, {
        args: { accountId: me.accountId },
        type: "openDirect",
      });
      const author = authors[index] ?? meAuthor;
      await importHistory(
        ctx,
        conversationId,
        history(
          [meAuthor, author],
          index === 0 ? 600 : 25,
          index === 0 ? 30 : 4,
        ),
      );
    }

    const [maya, jonah, priya, leo] = bots;
    if (!maya || !jonah || !priya || !leo) throw new Error("Missing bots");
    const group = await asAccount(ctx, jonah, {
      args: {
        members: [me.accountId, maya.accountId, priya.accountId],
        name: "Weekend crew",
      },
      type: "createGroup",
    });
    await importHistory(
      ctx,
      group.conversationId,
      history([meAuthor, ...authors.slice(0, 3)], 120, 6),
    );

    const { spaceId } = await asAccount(ctx, leo, {
      args: { name: "Bot Lounge" },
      type: "createSpace",
    });
    await asAccount(ctx, leo, {
      args: {
        members: [me.accountId, ...bots.map((bot) => bot.accountId)],
        spaceId,
      },
      type: "addSpaceMembers",
    });
    for (const name of ["random", "links"]) {
      await asAccount(ctx, leo, {
        args: { name, spaceId },
        type: "createChannel",
      });
    }
    const space = await queryAs(ctx, leo, { args: { spaceId }, type: "space" });
    for (const channel of space?.channels ?? []) {
      await importHistory(
        ctx,
        channel.conversationId,
        history(authors, channel.name === "general" ? 250 : 30, 10),
      );
    }

    // A few live messages so the inbox has unread conversations.
    await asAccount(ctx, maya, {
      args: {
        attachments: [],
        body: "Seeded! Reply here and I'll answer.",
        conversationId: group.conversationId,
        messageId: crypto.randomUUID(),
      },
      type: "send",
    });
    return { spaceId };
  },
});

/** Bots in a conversation answer the caller's latest message after a beat. */
export const replyToMe = action({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }) => {
    const me = await requireCaller(ctx);
    const conversation = await queryAs(ctx, me, {
      args: { conversationId },
      type: "conversation",
    });
    const responders = BOTS.filter((bot) =>
      conversation?.members.includes(botAddress(bot.username)),
    );
    const seed = Date.now();
    const count = Math.min(
      responders.length,
      conversation?.kind === "direct" ? 1 : 2,
    );
    for (let index = 0; index < count; index += 1) {
      const bot = pick(responders, seed + index);
      await ctx.scheduler.runAfter(
        1500 + index * 2000 + (seed % 1500),
        internal.dev.say,
        {
          body: pick(REPLIES, seed + index * 31),
          conversationId,
          username: bot.username,
        },
      );
    }
  },
});

export const say = internalAction({
  args: { body: v.string(), conversationId: v.string(), username: v.string() },
  handler: async (ctx, { body, conversationId, username }) => {
    requireDevTools();
    const bot = BOTS.find((candidate) => candidate.username === username);
    if (bot === undefined) return;
    await asAccount(ctx, botIdentity(bot), {
      args: {
        attachments: [],
        body,
        conversationId,
        messageId: crypto.randomUUID(),
      },
      type: "send",
    });
  },
});

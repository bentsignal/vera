import type { FunctionArgs } from "convex/server";
import { DECENTRALIZED_CONVEX_VERSION } from "@decentralized-convex/core";
import { v } from "convex/values";

import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { threadMessages } from "../assistant-threads";
import { internalMutation, internalQuery } from "./_generated/server";
import { createAuth } from "./auth";
import { actorFromEmail, requireEnvironment } from "./lib";
import { botName } from "./schema";

// Vera's own accounts: ordinary, verified accounts on this PDS that act
// through the Messages plugin as themselves. They have no passkey. Vera
// answers people with a model (agent.ts) whenever someone sends it a direct
// message; nothing it does reaches past that one conversation.

export interface BotAccount extends AnyBotAccount {
  readonly username: "vera";
}

/** Any of Vera's accounts, including the retired support account (mergeSupport.ts). */
export interface AnyBotAccount {
  readonly name: string;
  readonly username: string;
}

export const VERA = { name: "Vera", username: "vera" } as const;

/** The accounts that answer direct messages with a model. */
export const ASSISTANTS: readonly BotAccount[] = [VERA];

export function botAccount(username: BotAccount["username"]) {
  return { vera: VERA }[username];
}

/** Whether an address is one of Vera's own accounts. */
export function isBotAddress(accountId: string) {
  return ASSISTANTS.some((bot) => botAddress(bot) === accountId);
}

export function botAddress(bot: AnyBotAccount) {
  return `${bot.username}@${requireEnvironment("FEDERATION_DOMAIN").toLowerCase()}`;
}

export function botIdentity(bot: AnyBotAccount) {
  const accountId = botAddress(bot);
  return {
    accountId,
    issuer: `vera-${bot.username}`,
    name: bot.name,
    subject: accountId,
    tokenIdentifier: `vera-${bot.username}|${accountId}`,
  };
}

const request = {
  lastChanged: DECENTRALIZED_CONVEX_VERSION,
  version: DECENTRALIZED_CONVEX_VERSION,
} as const;

type MessagesMutation = FunctionArgs<
  typeof components.messages.dispatcher.dispatchMutation
>["operation"];
type MessagesQuery = FunctionArgs<
  typeof components.messages.dispatcher.dispatchQuery
>["operation"];

export function mutateAsBot(
  ctx: MutationCtx,
  bot: AnyBotAccount,
  operation: MessagesMutation,
) {
  return ctx.runMutation(components.messages.dispatcher.dispatchMutation, {
    ...request,
    identity: botIdentity(bot),
    operation,
  });
}

export function queryAsBot(
  ctx: QueryCtx,
  bot: AnyBotAccount,
  operation: MessagesQuery,
) {
  return ctx.runQuery(components.messages.dispatcher.dispatchQuery, {
    ...request,
    identity: botIdentity(bot),
    operation,
  });
}

/**
 * Sends `body` to a conversation the bot is in, as the bot, or with
 * `threadId`, to that thread, kept there.
 */
export async function sendAsBot(
  ctx: MutationCtx,
  bot: BotAccount,
  conversationId: string,
  body: string,
  { threadId }: { threadId?: string } = {},
) {
  const messageId = crypto.randomUUID();
  await mutateAsBot(ctx, bot, {
    args: {
      attachments: [],
      body,
      conversationId,
      messageId,
      ...(threadId !== undefined && { threadId, threadOnly: true }),
    },
    type: "send",
  });
  return messageId;
}

/**
 * Up to 50 of a thread's replies before `before` (or the latest), oldest
 * first, after its original once they reach the start.
 */
export async function threadPageAsBot(
  ctx: QueryCtx,
  bot: AnyBotAccount,
  conversationId: string,
  threadId: string,
  before?: number,
) {
  const response = await queryAsBot(ctx, bot, {
    args: { before, conversationId, threadId },
    type: "thread",
  });
  if (response.type !== "thread") throw new Error("Unexpected response");
  return {
    hasOlder: response.value.hasOlder,
    messages: threadMessages(threadId, response.value),
  };
}

/** Up to 50 messages before `before` (or the latest), oldest first. */
export async function pageAsBot(
  ctx: QueryCtx,
  bot: AnyBotAccount,
  conversationId: string,
  before?: number,
) {
  const response = await queryAsBot(ctx, bot, {
    args: { before, conversationId },
    type: "list",
  });
  if (response.type !== "list") throw new Error("Unexpected response");
  return response.value;
}

/** Creates the bot's account, with its name and verified check, if needed. */
export async function ensureBotAccount(ctx: ActionCtx, bot: BotAccount) {
  const address = botAddress(bot);
  const { internalAdapter } = await createAuth(ctx).$context;
  if ((await internalAdapter.findUserByEmail(address)) === null) {
    await internalAdapter.createUser({
      email: address,
      emailVerified: false,
      name: bot.username,
    });
  }
  await ctx.runMutation(internal.bots.ensureProfile, { bot: bot.username });
  return address;
}

/** Gives a bot its name and verified check, once. */
export const ensureProfile = internalMutation({
  args: { bot: botName },
  handler: async (ctx, args) => {
    const bot = botAccount(args.bot);
    const accountId = botAddress(bot);
    const profile = await ctx.runQuery(
      components.accounts.dispatcher.dispatchQuery,
      {
        ...request,
        identity: botIdentity(bot),
        operation: { args: { accountId }, type: "getProfile" },
      },
    );
    if (profile.value === null) {
      await ctx.runMutation(components.accounts.dispatcher.dispatchMutation, {
        ...request,
        identity: botIdentity(bot),
        operation: {
          args: { avatarUrl: null, displayName: bot.name },
          type: "upsertMyProfile",
        },
      });
    }
    await ctx.runMutation(components.accounts.affiliations.setAffiliated, {
      accountId,
      affiliated: true,
    });
  },
});

/**
 * The bot's DM with `accountId`. Its own mutation: a message sent in the
 * same one would share the new conversation's read time and never count as
 * unread.
 */
export const openConversation = internalMutation({
  args: { accountId: v.string(), bot: botName },
  handler: async (ctx, { accountId, bot }) => {
    const response = await mutateAsBot(ctx, botAccount(bot), {
      args: { accountId },
      type: "openDirect",
    });
    if (response.type !== "openDirect") throw new Error("Unexpected response");
    return response.value.conversationId;
  },
});

/** Sends a welcome to the DM, unless the bot has already written there. */
export const sendWelcome = internalMutation({
  args: { body: v.string(), bot: botName, conversationId: v.string() },
  handler: async (ctx, { body, bot, conversationId }) => {
    const account = botAccount(bot);
    const page = await pageAsBot(ctx, account, conversationId);
    const self = botAddress(account);
    if (page.messages.some((message) => message.authorId === self)) return;
    await sendAsBot(ctx, account, conversationId, body);
  },
});

export async function welcomeAccount(
  ctx: ActionCtx,
  bot: BotAccount,
  accountId: string,
  body: string,
) {
  // Bots are accounts too, made through the same sign-up hook.
  if (isBotAddress(accountId)) return;
  const conversationId = await ctx.runMutation(internal.bots.openConversation, {
    accountId,
    bot: bot.username,
  });
  await ctx.runMutation(internal.bots.sendWelcome, {
    body,
    bot: bot.username,
    conversationId,
  });
}

/**
 * Welcomes every account on this PDS that hasn't heard from the bot yet,
 * such as accounts made before it existed. Other bots are skipped.
 */
export async function welcomeEveryAccount(
  ctx: ActionCtx,
  bot: BotAccount,
  body: string,
) {
  await ensureBotAccount(ctx, bot);
  let cursor: string | null = null;
  let checked = 0;
  for (;;) {
    const result: unknown = await ctx.runQuery(
      components.betterAuth.adapter.findMany,
      { model: "user", paginationOpts: { cursor, numItems: 100 } },
    );
    const users = field(result, "page");
    for (const user of Array.isArray(users) ? users : []) {
      const email = field(user, "email");
      if (typeof email !== "string") continue;
      const accountId = actorFromEmail(email);
      if (isBotAddress(accountId)) continue;
      await welcomeAccount(ctx, bot, accountId, body);
      checked += 1;
    }
    const next = field(result, "continueCursor");
    if (field(result, "isDone") === true || typeof next !== "string") {
      return { checked };
    }
    cursor = next;
  }
}

/**
 * Sends a message as the bot (agent.ts's `send_message`, support updates),
 * or with `threadId`, to that thread.
 */
export const post = internalMutation({
  args: {
    body: v.string(),
    bot: botName,
    conversationId: v.string(),
    threadId: v.optional(v.string()),
  },
  handler: (ctx, { body, bot, conversationId, threadId }) =>
    sendAsBot(ctx, botAccount(bot), conversationId, body, { threadId }),
});

export const setTyping = internalMutation({
  args: {
    bot: botName,
    conversationId: v.string(),
    threadId: v.optional(v.string()),
    typing: v.boolean(),
  },
  handler: async (ctx, { bot, conversationId, threadId, typing }) => {
    await mutateAsBot(ctx, botAccount(bot), {
      args: { conversationId, threadId, typing },
      type: "setTyping",
    });
  },
});

/** Marks a conversation read, or with `threadId`, that thread. */
export const markRead = internalMutation({
  args: {
    bot: botName,
    conversationId: v.string(),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, { bot, conversationId, threadId }) => {
    const readAt = Date.now();
    await mutateAsBot(
      ctx,
      botAccount(bot),
      threadId === undefined
        ? { args: { conversationId, readAt }, type: "markRead" }
        : { args: { conversationId, readAt, threadId }, type: "markThreadRead" },
    );
  },
});

/** A page of a conversation, or with `threadId`, of that thread. */
export const page = internalQuery({
  args: {
    before: v.optional(v.number()),
    bot: botName,
    conversationId: v.string(),
    threadId: v.optional(v.string()),
  },
  handler: (ctx, { before, bot, conversationId, threadId }) =>
    threadId === undefined
      ? pageAsBot(ctx, botAccount(bot), conversationId, before)
      : threadPageAsBot(ctx, botAccount(bot), conversationId, threadId, before),
});

export function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, name)
    : undefined;
}

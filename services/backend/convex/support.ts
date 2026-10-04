import type { FunctionArgs } from "convex/server";
import { formatAddress, parseAddress } from "@decentralized-convex/address";
import { DECENTRALIZED_CONVEX_VERSION } from "@decentralized-convex/core";
import { ConvexError, v } from "convex/values";

import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { createAuth } from "./auth";
import { actorFromEmail, requireEnvironment } from "./lib";

// The support account: an ordinary, verified account on this PDS that
// welcomes every new account and that the operator's agents read and answer
// with the commands below (see the `support-inbox` agent skill). Nothing
// replies automatically. It has no passkey; it acts only through these
// operator commands.

const SUPPORT_USERNAME = "support";
const SUPPORT_NAME = "Vera Support";
const WELCOME_MESSAGE =
  "Hi, welcome to Vera! If you notice any bugs or anything that isn't working right, send them here. We read every message and will let you know when it's fixed.";

export function supportAddress() {
  return `${SUPPORT_USERNAME}@${requireEnvironment("FEDERATION_DOMAIN").toLowerCase()}`;
}

function supportIdentity() {
  const accountId = supportAddress();
  return {
    accountId,
    issuer: "vera-support",
    name: SUPPORT_NAME,
    subject: accountId,
    tokenIdentifier: `vera-support|${accountId}`,
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

function mutateAsSupport(ctx: MutationCtx, operation: MessagesMutation) {
  return ctx.runMutation(components.messages.dispatcher.dispatchMutation, {
    ...request,
    identity: supportIdentity(),
    operation,
  });
}

function queryAsSupport(ctx: QueryCtx, operation: MessagesQuery) {
  return ctx.runQuery(components.messages.dispatcher.dispatchQuery, {
    ...request,
    identity: supportIdentity(),
    operation,
  });
}

async function openDirect(ctx: MutationCtx, accountId: string) {
  const response = await mutateAsSupport(ctx, {
    args: { accountId },
    type: "openDirect",
  });
  if (response.type !== "openDirect") throw new Error("Unexpected response");
  return response.value.conversationId;
}

async function sendAsSupport(
  ctx: MutationCtx,
  conversationId: string,
  body: string,
) {
  const messageId = crypto.randomUUID();
  await mutateAsSupport(ctx, {
    args: { attachments: [], body, conversationId, messageId },
    type: "send",
  });
  return messageId;
}

async function latestPage(
  ctx: QueryCtx,
  conversationId: string,
  before?: number,
) {
  const response = await queryAsSupport(ctx, {
    args: { before, conversationId },
    type: "list",
  });
  if (response.type !== "list") throw new Error("Unexpected response");
  return response.value;
}

/** Creates the support account if it doesn't exist yet. */
async function ensureSupportAccount(ctx: ActionCtx) {
  const address = supportAddress();
  const { internalAdapter } = await createAuth(ctx).$context;
  if ((await internalAdapter.findUserByEmail(address)) === null) {
    await internalAdapter.createUser({
      email: address,
      emailVerified: false,
      name: SUPPORT_USERNAME,
    });
  }
  await ctx.runMutation(internal.support.ensureProfile, {});
  return address;
}

/** Gives the support account its name and verified check, once. */
export const ensureProfile = internalMutation({
  args: {},
  handler: async (ctx) => {
    const accountId = supportAddress();
    const profile = await ctx.runQuery(
      components.accounts.dispatcher.dispatchQuery,
      {
        ...request,
        identity: supportIdentity(),
        operation: { args: { accountId }, type: "getProfile" },
      },
    );
    if (profile.value === null) {
      await ctx.runMutation(components.accounts.dispatcher.dispatchMutation, {
        ...request,
        identity: supportIdentity(),
        operation: {
          args: { avatarUrl: null, displayName: SUPPORT_NAME },
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

/** Operator command: `npx convex run support:setup`. Safe to run again. */
export const setup = internalAction({
  args: {},
  handler: (ctx) => ensureSupportAccount(ctx),
});

/**
 * Sends the welcome message to a new account, unless support has already
 * written to them. Scheduled whenever an account is created.
 */
export const welcome = internalAction({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }) => {
    if (accountId === supportAddress()) return;
    await ensureSupportAccount(ctx);
    await welcomeAccount(ctx, accountId);
  },
});

async function welcomeAccount(ctx: ActionCtx, accountId: string) {
  const conversationId = await ctx.runMutation(
    internal.support.openConversation,
    { accountId },
  );
  await ctx.runMutation(internal.support.sendWelcome, { conversationId });
}

/**
 * The DM with `accountId`. Its own mutation: a message sent in the same one
 * would share the new conversation's read time and never count as unread.
 */
export const openConversation = internalMutation({
  args: { accountId: v.string() },
  handler: (ctx, { accountId }) => openDirect(ctx, accountId),
});

export const sendWelcome = internalMutation({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }) => {
    const page = await latestPage(ctx, conversationId);
    const support = supportAddress();
    if (page.messages.some((message) => message.authorId === support)) return;
    await sendAsSupport(ctx, conversationId, WELCOME_MESSAGE);
  },
});

export const post = internalMutation({
  args: { body: v.string(), conversationId: v.string() },
  handler: (ctx, { body, conversationId }) =>
    sendAsSupport(ctx, conversationId, body),
});

/**
 * Operator command: `npx convex run support:welcomeEveryone`. Welcomes
 * accounts made before the support account existed. Accounts that already
 * heard from support are skipped.
 */
export const welcomeEveryone = internalAction({
  args: {},
  handler: async (ctx) => {
    const support = await ensureSupportAccount(ctx);
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
        if (accountId === support) continue;
        await welcomeAccount(ctx, accountId);
        checked += 1;
      }
      const next = field(result, "continueCursor");
      if (field(result, "isDone") === true || typeof next !== "string") {
        return { checked };
      }
      cursor = next;
    }
  },
});

/**
 * Operator command: `npx convex run support:inbox`. Support's
 * conversations, unread first, each with its latest message.
 */
export const inbox = internalQuery({
  args: { unreadOnly: v.optional(v.boolean()) },
  handler: async (ctx, { unreadOnly }) => {
    const response = await queryAsSupport(ctx, { args: {}, type: "inbox" });
    if (response.type !== "inbox") throw new Error("Unexpected response");
    const support = supportAddress();
    return response.value
      .filter(
        (conversation) => unreadOnly !== true || conversation.unreadCount > 0,
      )
      .sort(
        (a, b) =>
          Number(b.unreadCount > 0) - Number(a.unreadCount > 0) ||
          b.updatedAt - a.updatedAt,
      )
      .map((conversation) => ({
        conversationId: conversation.conversationId,
        kind: conversation.kind,
        lastMessage:
          conversation.lastMessage === null
            ? null
            : {
                from: conversation.lastMessage.authorId,
                body: conversation.lastMessage.body,
                sentAt: new Date(conversation.lastMessage.sentAt).toISOString(),
              },
        name: conversation.name,
        people: conversation.members.filter((member) => member !== support),
        unreadCount: conversation.unreadCount,
      }));
  },
});

/**
 * Operator command:
 * `npx convex run support:read '{"conversationId":"..."}'`. The latest
 * messages, oldest first; pass `before` (a `sentAtMs`) for older ones.
 */
export const read = internalQuery({
  args: { before: v.optional(v.number()), conversationId: v.string() },
  handler: async (ctx, { before, conversationId }) => {
    const page = await latestPage(ctx, conversationId, before);
    return {
      hasOlder: page.hasOlder,
      messages: page.messages.map((message) => ({
        attachments: message.attachments.map((attachment) => attachment.url),
        body: message.body,
        from: message.authorId,
        messageId: message.messageId,
        sentAt: new Date(message.sentAt).toISOString(),
        sentAtMs: message.sentAt,
      })),
    };
  },
});

/**
 * Operator command:
 * `npx convex run support:send '{"conversationId":"...","body":"..."}'`,
 * or `"to":"someone@vera.chat"` instead of `conversationId` to message an
 * account directly. Sends as the support account.
 */
export const send = internalAction({
  args: {
    body: v.string(),
    conversationId: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ conversationId: string; messageId: string }> => {
    const body = args.body.trim();
    if (body.length === 0) throw new ConvexError({ code: "EMPTY_MESSAGE" });
    const conversationId: string | undefined =
      args.to === undefined
        ? args.conversationId
        : await ctx.runMutation(internal.support.openConversation, {
            accountId: formatAddress(parseAddress(args.to)),
          });
    if (conversationId === undefined) {
      throw new ConvexError({ code: "CONVERSATION_OR_TO_REQUIRED" });
    }
    const messageId: string = await ctx.runMutation(internal.support.post, {
      body,
      conversationId,
    });
    return { conversationId, messageId };
  },
});

/**
 * Operator command:
 * `npx convex run support:markRead '{"conversationId":"..."}'`.
 */
export const markRead = internalMutation({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }) => {
    await mutateAsSupport(ctx, {
      args: { conversationId, readAt: Date.now() },
      type: "markRead",
    });
  },
});

function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, name)
    : undefined;
}

import type { Message } from "@decentralized-convex/messages";
import { DECENTRALIZED_CONVEX_VERSION } from "@decentralized-convex/core";
import { v } from "convex/values";

import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import type { AnyBotAccount } from "./bots";
import { components, internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { createAuth } from "./auth";
import { botAddress, mutateAsBot, pageAsBot, queryAsBot, VERA } from "./bots";

// Vera Support was its own account until it became part of Vera (vera.ts
// files bug reports now). This moves each person's conversation with
// support into their conversation with Vera, every message at the time it
// was sent, then deletes support's conversations and its account. Run it
// once on each deployment, after deploying the backend that merged them:
//
//   npx convex run mergeSupport:run
//
// Each conversation moves in one mutation, so a failure leaves it as it
// was, and running it again moves whatever is left.

export const SUPPORT: AnyBotAccount = {
  name: "Vera Support",
  username: "support",
};

/** Support's welcome, which isn't copied: Vera welcomed everyone too. */
export const SUPPORT_WELCOME =
  "Hi, welcome to Vera! If you notice any bugs or anything that isn't working right, tell me here. I'll pass it to the team and let you know when it's fixed.";

export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<{ moved: number; accountRemoved: boolean }> => {
    const conversationIds: string[] = await ctx.runQuery(
      internal.mergeSupport.conversations,
      {},
    );
    for (const conversationId of conversationIds) {
      await ctx.runMutation(internal.mergeSupport.move, { conversationId });
    }
    const left: string[] = await ctx.runQuery(
      internal.mergeSupport.conversations,
      {},
    );
    if (left.length > 0)
      return { accountRemoved: false, moved: conversationIds.length };
    await removeSupportAccount(ctx);
    return { accountRemoved: true, moved: conversationIds.length };
  },
});

/** Every conversation support is in. */
export const conversations = internalQuery({
  args: {},
  handler: async (ctx) => {
    const response = await queryAsBot(ctx, SUPPORT, {
      args: {},
      type: "inbox",
    });
    if (response.type !== "inbox") throw new Error("Unexpected response");
    return response.value.map((conversation) => conversation.conversationId);
  },
});

/** Moves one of support's conversations into Vera's, and deletes it. */
export const move = internalMutation({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }) => {
    const support = botAddress(SUPPORT);
    const person = otherMember(conversationId, support);
    if (person === null) {
      // A group someone added support to: it leaves.
      await mutateAsBot(ctx, SUPPORT, {
        args: { conversationId },
        type: "leaveConversation",
      });
      return;
    }
    const messages = await everyMessage(ctx, conversationId);
    const readThrough = await readThroughOf(
      ctx,
      person,
      conversationId,
      messages,
    );
    const opened = await mutateAsBot(ctx, VERA, {
      args: { accountId: person },
      type: "openDirect",
    });
    if (opened.type !== "openDirect") throw new Error("Unexpected response");
    const veraConversation = opened.value.conversationId;
    const copies = messages
      .filter(
        (message) =>
          message.deletedAt === undefined &&
          message.threadOnly !== true &&
          !(message.authorId === support && message.body === SUPPORT_WELCOME),
      )
      .map((message) => copyOf(message, support));
    if (copies.length > 0) {
      await ctx.runMutation(components.messages.history.importHistory, {
        conversationId: veraConversation,
        messages: copies,
      });
      await forgetMemory(ctx, veraConversation);
      await ctx.scheduler.runAfter(0, internal.memoryBuild.update, {
        bot: VERA.username,
        conversationId: veraConversation,
      });
    }
    // What they'd read with support stays read with Vera.
    if (readThrough !== null) {
      await ctx.runMutation(components.messages.dispatcher.dispatchMutation, {
        ...request,
        identity: identityOf(person),
        operation: {
          args: { conversationId: veraConversation, readAt: readThrough },
          type: "markRead",
        },
      });
    }
    for (;;) {
      const { done } = await ctx.runMutation(
        components.messages.history.deleteConversation,
        { conversationId },
      );
      if (done) break;
    }
    await moveRecords(ctx, { conversationId, person, veraConversation });
  },
});

const request = {
  lastChanged: DECENTRALIZED_CONVEX_VERSION,
  version: DECENTRALIZED_CONVEX_VERSION,
} as const;

/** The person in a DM with `self`, or null for a group. */
function otherMember(conversationId: string, self: string) {
  if (!conversationId.startsWith("direct:")) return null;
  const members = conversationId.slice("direct:".length).split(":");
  return members.find((member) => member !== self) ?? null;
}

/** Every message in the conversation, oldest first. */
async function everyMessage(ctx: QueryCtx, conversationId: string) {
  const messages: Message[] = [];
  let before: number | undefined;
  for (;;) {
    const page = await pageAsBot(ctx, SUPPORT, conversationId, before);
    messages.unshift(...page.messages);
    const oldest = page.messages.at(0);
    if (!page.hasOlder || oldest === undefined) return messages;
    before = oldest.sentAt;
  }
}

/** A support message as Vera's, or the person's own as it was. */
function copyOf(message: Message, support: string) {
  const fromSupport = message.authorId === support;
  return {
    attachments: message.attachments,
    authorId: fromSupport ? botAddress(VERA) : message.authorId,
    authorName: fromSupport ? VERA.name : message.authorName,
    body: message.body,
    editedAt: message.editedAt,
    linkPreview: message.linkPreview ?? undefined,
    linkPreviews: message.linkPreviews,
    // New IDs: the originals are still stored until the end of the move.
    messageId: crypto.randomUUID(),
    sentAt: message.sentAt,
  };
}

/** Acts as the person, only to carry their read position over. */
function identityOf(accountId: string) {
  return {
    accountId,
    issuer: "vera-merge-support",
    name: accountId,
    subject: accountId,
    tokenIdentifier: `vera-merge-support|${accountId}`,
  };
}

/**
 * When the person had read support's messages through, or null when they
 * never read any: their newest message, or support's newest one before
 * those still unread.
 */
async function readThroughOf(
  ctx: QueryCtx,
  person: string,
  conversationId: string,
  messages: readonly Message[],
) {
  const response = await ctx.runQuery(
    components.messages.dispatcher.dispatchQuery,
    {
      ...request,
      identity: identityOf(person),
      operation: { args: { conversationId }, type: "conversation" },
    },
  );
  if (response.type !== "conversation" || response.value === null) return null;
  const shown = messages.filter(
    (message) => message.deletedAt === undefined && message.threadOnly !== true,
  );
  const theirs = shown.filter((message) => message.authorId === person);
  const others = shown.filter((message) => message.authorId !== person);
  const read = others.slice(0, others.length - response.value.unreadCount);
  const latest = Math.max(theirs.at(-1)?.sentAt ?? 0, read.at(-1)?.sentAt ?? 0);
  return latest === 0 ? null : latest;
}

/** Vera's memory of a conversation, rebuilt after messages are added in the middle. */
async function forgetMemory(ctx: MutationCtx, conversationId: string) {
  const passages = await ctx.db
    .query("memoryPassages")
    .withIndex("by_conversation_last", (q) =>
      q.eq("conversationId", conversationId),
    )
    .collect();
  for (const passage of passages) {
    const links = await ctx.db
      .query("memoryLinks")
      .withIndex("by_passage", (q) => q.eq("passageId", passage._id))
      .collect();
    await Promise.all(links.map((link) => ctx.db.delete(link._id)));
    await ctx.db.delete(passage._id);
  }
}

/**
 * Points the person's bug reports at their conversation with Vera, which
 * sends the updates now, and drops support's reply state and limits.
 */
async function moveRecords(
  ctx: MutationCtx,
  {
    conversationId,
    person,
    veraConversation,
  }: { conversationId: string; person: string; veraConversation: string },
) {
  const reports = await ctx.db
    .query("bugReports")
    .withIndex("by_account", (q) => q.eq("accountId", person))
    .collect();
  for (const report of reports) {
    if (report.conversationId === conversationId) {
      await ctx.db.patch(report._id, { conversationId: veraConversation });
    }
  }
  const replies = await ctx.db
    .query("botConversations")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .collect();
  await Promise.all(replies.map((row) => ctx.db.delete(row._id)));
  const limits = await ctx.db
    .query("rateLimits")
    .withIndex("by_account", (q) =>
      q.eq("accountId", person).eq("bot", "support"),
    )
    .collect();
  await Promise.all(limits.map((row) => ctx.db.delete(row._id)));
}

/** Deletes support's profile, verified check, and account. */
async function removeSupportAccount(ctx: ActionCtx) {
  const address = botAddress(SUPPORT);
  await ctx.runMutation(components.accounts.affiliations.removeAccount, {
    accountId: address,
  });
  const { internalAdapter } = await createAuth(ctx).$context;
  const user = await internalAdapter.findUserByEmail(address);
  if (user !== null) await internalAdapter.deleteUser(user.user.id);
}

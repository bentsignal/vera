import type { OperationArgs } from "@decentralized-convex/plugin";

import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { messagesProtocol, Quote, ThreadSummary } from "./protocol.ts";
import { fail, memberAddresses, requireAccess, toMessage } from "./model.ts";
import { pageOf } from "./paging.ts";
import {
  MAX_REACTION_MESSAGES,
  MAX_REPLIERS,
  MAX_SINCE_RESULTS,
} from "./protocol.ts";
import { recordSighting, seeMentions, threadKey } from "./sightings.ts";

// Replies and threads. A reply is a message with `threadId`, the ID of its
// thread's original. Threads are flat. A reply sent from the conversation
// shows there too; one sent in the thread is `threadOnly`.

type Operations = (typeof messagesProtocol)["mutations"] &
  (typeof messagesProtocol)["queries"];
type Args<Operation extends keyof Operations> = OperationArgs<
  Operations[Operation]
>;

/** How much of the answered message's text a reply keeps in its quote. */
export const QUOTE_LENGTH = 300;

export function messageById(ctx: QueryCtx, messageId: string) {
  return ctx.db
    .query("messages")
    .withIndex("by_message", (index) => index.eq("messageId", messageId))
    .unique();
}

export function threadRow(ctx: QueryCtx, threadId: string) {
  return ctx.db
    .query("threads")
    .withIndex("by_thread", (index) => index.eq("threadId", threadId))
    .unique();
}

export function threadMember(
  ctx: QueryCtx,
  threadId: string,
  accountId: string,
) {
  return ctx.db
    .query("threadMembers")
    .withIndex("by_thread_account", (index) =>
      index.eq("threadId", threadId).eq("accountId", accountId),
    )
    .unique();
}

/** Every account in a thread on this PDS. */
export function threadMembers(ctx: QueryCtx, threadId: string) {
  return ctx.db
    .query("threadMembers")
    .withIndex("by_thread_account", (index) => index.eq("threadId", threadId))
    .collect();
}

function quoteOf(answered: Doc<"messages">): Quote {
  if (answered.deletedAt !== undefined) {
    return {
      authorId: answered.authorId,
      body: "",
      deleted: true,
      messageId: answered.messageId,
    };
  }
  return {
    attachment: answered.attachments[0],
    authorId: answered.authorId,
    body: answered.body.slice(0, QUOTE_LENGTH),
    messageId: answered.messageId,
  };
}

/**
 * The original a message in `conversationId` is in reply to: the message
 * `threadId` names, or its own original when that's a reply (threads are
 * flat). Fails unless it's in the conversation.
 */
async function originalOf(
  ctx: QueryCtx,
  conversationId: string,
  threadId: string,
) {
  const named = await messageById(ctx, threadId);
  const original =
    named?.threadId === undefined
      ? named
      : await messageById(ctx, named.threadId);
  if (original?.conversationId !== conversationId) fail("MESSAGE_NOT_FOUND");
  return original;
}

/**
 * Where a new reply to `threadId` goes: its original's thread, its quote
 * of the message it answers (a reply, when it names one), and whether it
 * stays in the thread. The sender says that with `threadOnly`; without it
 * (older apps), only the thread's first reply shows in the conversation.
 */
export async function replyTo(
  ctx: QueryCtx,
  conversationId: string,
  threadId: string,
  threadOnly?: boolean,
) {
  const original = await originalOf(ctx, conversationId, threadId);
  const answered =
    original.messageId === threadId
      ? original
      : await messageById(ctx, threadId);
  const thread = await threadRow(ctx, original.messageId);
  const staysInThread =
    threadOnly ?? (thread !== null && thread.replyCount > 0);
  return {
    conversationId,
    quote: quoteOf(answered ?? original),
    rootAuthorId: original.authorId,
    rootSentAt: original.sentAt,
    threadId: original.messageId,
    // Left out, not false, for one shown in the conversation (`by_chat_sent`).
    threadOnly: staysInThread ? true : undefined,
  };
}

/**
 * Counts a stored reply in its thread, and keeps its people up to date:
 * the original's author joins the thread (unless they turned it off
 * before anyone replied), the replier joins (or rejoins) it having read
 * it, and everyone in it sees it as their thread's newest reply.
 */
export async function addReply(
  ctx: MutationCtx,
  reply: Awaited<ReturnType<typeof replyTo>> & {
    authorId: string;
    sentAt: number;
  },
) {
  const { authorId, conversationId, sentAt, threadId } = reply;
  const thread = await threadRow(ctx, threadId);
  if (thread === null) {
    await ctx.db.insert("threads", {
      conversationId,
      lastReplyAt: sentAt,
      replyCount: 1,
      repliers: [authorId],
      rootAuthorId: reply.rootAuthorId,
      threadId,
    });
  } else {
    await ctx.db.patch(thread._id, {
      lastReplyAt: sentAt,
      replyCount: thread.replyCount + 1,
      repliers: [
        authorId,
        ...thread.repliers.filter((replier) => replier !== authorId),
      ].slice(0, MAX_REPLIERS),
    });
  }
  const members = await threadMembers(ctx, threadId);
  for (const member of members) {
    await ctx.db.patch(member._id, {
      lastReplyAt: sentAt,
      ...(member.accountId === authorId
        ? { lastReadAt: sentAt, unfollowed: undefined }
        : {}),
    });
  }
  const known = new Set(members.map((member) => member.accountId));
  async function join(accountId: string, lastReadAt: number) {
    if (known.has(accountId)) return;
    known.add(accountId);
    await ctx.db.insert("threadMembers", {
      accountId,
      conversationId,
      lastReadAt,
      lastReplyAt: sentAt,
      threadId,
    });
  }
  await join(authorId, sentAt);
  // The original's author hasn't read the reply yet.
  await join(reply.rootAuthorId, reply.rootSentAt);
}

/**
 * One page of a thread's replies stored here, with its original when it's
 * stored here too, and the conversation's member addresses so the client
 * also asks every member's PDS.
 */
export async function thread(
  ctx: QueryCtx,
  self: string,
  args: Args<"thread">,
) {
  const { conversation } = await requireAccess(ctx, args.conversationId, self);
  const page = await pageOf(ctx, { threadId: args.threadId }, args);
  const root = await messageById(ctx, args.threadId);
  return {
    page: {
      ...page,
      messages: page.messages
        .filter((message) => message.conversationId === args.conversationId)
        .map(toMessage),
      root:
        root?.conversationId === args.conversationId ? toMessage(root) : null,
    },
    routes: await memberAddresses(ctx, conversation),
  };
}

/** The given messages' threads, or those replied to after `since`. */
async function threadRowsFor(
  ctx: QueryCtx,
  { conversationId, messageIds = [], since }: Args<"threadSummaries">,
) {
  if (since !== undefined) {
    return ctx.db
      .query("threads")
      .withIndex("by_conversation_reply", (index) =>
        index.eq("conversationId", conversationId).gt("lastReplyAt", since),
      )
      .order("desc")
      .take(MAX_SINCE_RESULTS);
  }
  if (messageIds.length > MAX_REACTION_MESSAGES) fail("TOO_MANY_MESSAGES");
  // Read concurrently, like reactions.
  return Promise.all(
    [...new Set(messageIds)].map((messageId) => threadRow(ctx, messageId)),
  );
}

/**
 * The given messages' threads that have replies stored here, or with
 * `since`, those replied to after then.
 */
export async function threadSummaries(
  ctx: QueryCtx,
  self: string,
  args: Args<"threadSummaries">,
) {
  const { conversation } = await requireAccess(ctx, args.conversationId, self);
  const [rows, routes] = await Promise.all([
    threadRowsFor(ctx, args),
    memberAddresses(ctx, conversation),
  ]);
  const summaries: ThreadSummary[] = rows.flatMap((row) =>
    row?.conversationId === args.conversationId
      ? [
          {
            lastReplyAt: row.lastReplyAt,
            replyCount: row.replyCount,
            repliers: row.repliers,
            threadId: row.threadId,
          },
        ]
      : [],
  );
  return { routes, summaries };
}

export async function threadState(
  ctx: QueryCtx,
  self: string,
  args: Args<"threadState">,
) {
  await requireAccess(ctx, args.conversationId, self);
  const member = await threadMember(ctx, args.threadId, self);
  return {
    following: member !== null && member.unfollowed !== true,
    lastReadAt: member?.lastReadAt ?? null,
  };
}

export async function markThreadRead(
  ctx: MutationCtx,
  self: string,
  args: Args<"markThreadRead">,
) {
  await requireAccess(ctx, args.conversationId, self);
  const readAt = Math.min(args.readAt, Date.now());
  const member = await threadMember(ctx, args.threadId, self);
  if (member !== null && readAt > member.lastReadAt) {
    await ctx.db.patch(member._id, { lastReadAt: readAt });
  }
  // Reading a thread sees its activity too, and its mentions of the caller.
  const now = Date.now();
  await recordSighting(ctx, self, {
    key: threadKey(args.threadId),
    now,
    through: readAt,
  });
  await seeMentions(ctx, self, { ...args, now, readAt });
  return null;
}

export async function setThreadFollowed(
  ctx: MutationCtx,
  self: string,
  args: Args<"setThreadFollowed">,
) {
  await requireAccess(ctx, args.conversationId, self);
  const member = await threadMember(ctx, args.threadId, self);
  if (member !== null) {
    await ctx.db.patch(member._id, {
      unfollowed: args.followed ? undefined : true,
    });
    return null;
  }
  const original = await originalOf(ctx, args.conversationId, args.threadId);
  if (original.messageId !== args.threadId) fail("MESSAGE_NOT_FOUND");
  const now = Date.now();
  const thread = await threadRow(ctx, args.threadId);
  await ctx.db.insert("threadMembers", {
    accountId: self,
    conversationId: args.conversationId,
    lastReadAt: now,
    lastReplyAt: thread?.lastReplyAt ?? original.sentAt,
    threadId: args.threadId,
    ...(args.followed ? {} : { unfollowed: true }),
  });
  return null;
}

/** Forgets a deleted conversation's threads. */
export async function deleteThreads(ctx: MutationCtx, conversationId: string) {
  const threads = await ctx.db
    .query("threads")
    .withIndex("by_conversation_reply", (index) =>
      index.eq("conversationId", conversationId),
    )
    .collect();
  for (const row of threads) {
    for (const member of await threadMembers(ctx, row.threadId)) {
      await ctx.db.delete(member._id);
    }
    await ctx.db.delete(row._id);
  }
}

import type { QueryRequest } from "@decentralized-convex/plugin";
import type { IncludedQuery } from "@decentralized-convex/server";
import { accountsProtocol } from "@decentralized-convex/accounts";
import { queryRequest } from "@decentralized-convex/plugin";

import type { QueryCtx } from "./_generated/server.js";
import type { Conversation, MemberEvent, Message } from "./protocol.ts";
import { MAX_REACTION_MESSAGES, messagesProtocol } from "./protocol.ts";
import { threadRow } from "./threads.ts";

// What a query includes: the queries an app asks for next to show its
// result, built exactly as apps build them, so the PDS answers them in the
// same round trip (see `queryResult`). An app that asks differently just
// asks for them itself, as before.

function profiles(addresses: Iterable<string>) {
  return [...new Set(addresses)].map((accountId) =>
    queryRequest(accountsProtocol, "getProfile", { accountId }),
  );
}

/** Each message's thread: its own, or for a reply, its original's. */
function threadIdsOf(messages: readonly Message[]) {
  return [
    ...new Set(
      messages.map((message) => message.threadId ?? message.messageId),
    ),
  ];
}

/**
 * The reactions and thread summaries of everything after `since`, as an
 * app asks for them for the newest messages, which are still arriving.
 */
function since(conversationId: string, after: number) {
  return [
    queryRequest(messagesProtocol, "reactions", {
      conversationId,
      since: after,
    }),
    queryRequest(messagesProtocol, "threadSummaries", {
      conversationId,
      since: after,
    }),
  ];
}

/** The reactions and thread summaries of one batch of messages. */
function batch(conversationId: string, messages: readonly Message[]) {
  const messageIds = messages.map((message) => message.messageId);
  const threadIds = threadIdsOf(messages);
  if (messageIds.length === 0) return [];
  return [
    ...(messageIds.length <= MAX_REACTION_MESSAGES
      ? [
          queryRequest(messagesProtocol, "reactions", {
            conversationId,
            messageIds,
          }),
        ]
      : []),
    ...(threadIds.length <= MAX_REACTION_MESSAGES
      ? [
          queryRequest(messagesProtocol, "threadSummaries", {
            conversationId,
            messageIds: threadIds,
          }),
        ]
      : []),
  ];
}

/**
 * Who a page of messages shows: their authors, the authors of the messages
 * replies quote, and who replied in their threads.
 */
async function shownPeople(ctx: QueryCtx, messages: readonly Message[]) {
  const threads = await Promise.all(
    threadIdsOf(messages).map((threadId) => threadRow(ctx, threadId)),
  );
  return [
    ...messages.flatMap((message) => [
      message.authorId,
      ...(message.quote === undefined ? [] : [message.quote.authorId]),
    ]),
    ...threads.flatMap((thread) => thread?.repliers ?? []),
  ];
}

/** How an app follows a page's reactions and threads (see `liveCursor`). */
type Live = number | "byTime" | undefined;

/** A page's reactions and thread summaries, as `live` says apps ask. */
function followed(
  conversationId: string,
  messages: readonly Message[],
  live: Live,
) {
  if (live === undefined) return batch(conversationId, messages);
  if (live === "byTime") return [];
  return since(conversationId, live);
}

/**
 * What a page of a conversation shows its messages with. `live` is the
 * cursor of a page of the newest messages (`after`, with none newer),
 * whose reactions and threads apps follow by time as messages arrive;
 * `byTime` for a page that filled up while followed that way, whose
 * reactions and threads come with the newest page's.
 */
export async function pageIncludes(
  ctx: QueryCtx,
  conversationId: string,
  messages: readonly Message[],
  live?: Live,
): Promise<QueryRequest[]> {
  return [
    ...followed(conversationId, messages, live),
    ...profiles(await shownPeople(ctx, messages)),
  ];
}

/**
 * The cursor of a page of the newest messages, for `pageIncludes`. A page
 * newer than `after` that an app asked to keep small (`limit`) is one it
 * follows the newest messages with, and once full, it still follows its
 * reactions and threads by time (`byTime`).
 */
export function liveCursor(
  args: { readonly after?: number; readonly limit?: number },
  page: { readonly hasNewer: boolean },
): Live {
  if (!page.hasNewer) return args.after;
  return args.after !== undefined && args.limit !== undefined
    ? "byTime"
    : undefined;
}

/**
 * What a page of a thread shows: its original's reactions and replies
 * (asked for apart from the page's), and the page's own. Who's typing
 * isn't included: it changes every few seconds while someone types, and
 * an included query reruns the page with it.
 */
export async function threadPageIncludes(
  ctx: QueryCtx,
  { conversationId }: { conversationId: string },
  root: Message | null,
  messages: readonly Message[],
  live?: Live,
): Promise<QueryRequest[]> {
  const rootOnly = root === null ? [] : [root];
  return [
    ...(root === null
      ? []
      : [
          queryRequest(messagesProtocol, "reactions", {
            conversationId,
            messageIds: [root.messageId],
          }),
          queryRequest(messagesProtocol, "threadSummaries", {
            conversationId,
            messageIds: [root.messageId],
          }),
        ]),
    ...threadReactions(conversationId, messages, live),
    ...profiles(await shownPeople(ctx, [...rootOnly, ...messages])),
  ];
}

/** A thread page's replies' reactions, as `live` says apps ask. */
function threadReactions(
  conversationId: string,
  messages: readonly Message[],
  live: Live,
) {
  if (live === "byTime") return [];
  if (live !== undefined) {
    return [
      queryRequest(messagesProtocol, "reactions", {
        conversationId,
        since: live,
      }),
    ];
  }
  if (messages.length === 0 || messages.length > MAX_REACTION_MESSAGES) {
    return [];
  }
  return [
    queryRequest(messagesProtocol, "reactions", {
      conversationId,
      messageIds: messages.map((message) => message.messageId),
    }),
  ];
}

/**
 * The people an Inbox row shows: the other person in a direct
 * conversation, an unnamed group's members (its title), and the last
 * message's author.
 */
export function inboxIncludes(
  self: string,
  conversations: readonly Conversation[],
): QueryRequest[] {
  return profiles(
    conversations.flatMap(({ kind, lastMessage, members, name }) => {
      const others = members.filter((member) => member !== self);
      const titled =
        kind === "direct"
          ? [others[0] ?? self]
          : kind === "group" && name === null
            ? others
            : [];
      const author = lastMessage?.authorId;
      return author === undefined || author === self
        ? titled
        : [...titled, author];
    }),
  );
}

/**
 * What the inbox's list includes: each row, as its `conversation` query
 * answers it (already worked out, so not again), and the people the rows
 * show (see `inboxIncludes`).
 */
export function inboxRowIncludes(
  self: string,
  rows: readonly Conversation[],
): IncludedQuery[] {
  return [
    ...rows.map((row) => ({
      request: queryRequest(messagesProtocol, "conversation", {
        conversationId: row.conversationId,
      }),
      routes: [],
      value: row,
    })),
    ...inboxIncludes(self, rows),
  ];
}

/**
 * A direct conversation's or a group's members, whose names it shows,
 * and a group's joins and leaves (`events`), with the names of those
 * people. Who's typing isn't included: it changes every few seconds while
 * someone types, and an included query reruns the conversation with it.
 */
export function conversationIncludes(
  conversation: Conversation | null,
  events: readonly MemberEvent[],
): QueryRequest[] {
  if (conversation === null) return [];
  const { conversationId, kind, members } = conversation;
  if (kind === "channel") return [];
  return [
    ...(kind === "group"
      ? [queryRequest(messagesProtocol, "memberEvents", { conversationId })]
      : []),
    ...profiles([...members, ...events.map(({ accountId }) => accountId)]),
  ];
}

/** The names of the people who joined and left. */
export function memberEventIncludes(
  events: readonly MemberEvent[],
): QueryRequest[] {
  return profiles(events.map(({ accountId }) => accountId));
}

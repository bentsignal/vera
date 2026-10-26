import type { QueryRequest } from "@decentralized-convex/plugin";
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

/**
 * What a page of a conversation shows its messages with. `live` is the
 * cursor of a page of the newest messages (`after`, with none newer),
 * whose reactions and threads apps follow by time as messages arrive.
 */
export async function pageIncludes(
  ctx: QueryCtx,
  conversationId: string,
  messages: readonly Message[],
  live?: number,
): Promise<QueryRequest[]> {
  return [
    ...(live === undefined
      ? batch(conversationId, messages)
      : since(conversationId, live)),
    ...profiles(await shownPeople(ctx, messages)),
  ];
}

/** The cursor of a page of the newest messages, for `pageIncludes`. */
export function liveCursor(
  args: { readonly after?: number },
  page: { readonly hasNewer: boolean },
) {
  return page.hasNewer ? undefined : args.after;
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
  live?: number,
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
    ...(live !== undefined
      ? [
          queryRequest(messagesProtocol, "reactions", {
            conversationId,
            since: live,
          }),
        ]
      : messages.length > 0 && messages.length <= MAX_REACTION_MESSAGES
        ? [
            queryRequest(messagesProtocol, "reactions", {
              conversationId,
              messageIds: messages.map((message) => message.messageId),
            }),
          ]
        : []),
    ...profiles(await shownPeople(ctx, [...rootOnly, ...messages])),
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

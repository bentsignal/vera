import assert from "node:assert/strict";
import test from "node:test";

import type { Conversation, Message } from "./protocol.ts";
import { fakeCtx } from "./fakeCtx.ts";
import {
  conversationIncludes,
  inboxIncludes,
  pageIncludes,
} from "./includes.ts";

const ME = "me@vera.chat";
const MAYA = "maya@vera.chat";
const LEO = "leo@vera.chat";
const PRIYA = "priya@vera.chat";

function conversation(extra: Partial<Conversation>): Conversation {
  return {
    alerts: "all",
    conversationId: "group:vera.chat:1",
    kind: "group",
    lastMessage: null,
    members: [ME, MAYA, LEO],
    muted: false,
    name: null,
    spaceId: null,
    unreadCount: 0,
    updatedAt: 0,
    ...extra,
  };
}

function message(messageId: string, extra: Partial<Message> = {}): Message {
  return {
    attachments: [],
    authorId: MAYA,
    authorName: "Maya",
    body: "hi",
    conversationId: "group:vera.chat:1",
    linkPreview: null,
    messageId,
    sentAt: 0,
    ...extra,
  };
}

/** What each included query asks for, as `type args`. */
function asked(
  include: readonly { operation: { args: unknown; type: string } }[],
) {
  return include.map(({ operation }) =>
    [operation.type, JSON.stringify(operation.args)].join(" "),
  );
}

void test("an inbox includes the profiles its rows show", () => {
  const rows = [
    conversation({
      conversationId: `direct:${MAYA}:${ME}`,
      kind: "direct",
      members: [MAYA, ME],
    }),
    // A named group's title is its name, so only the last author shows.
    conversation({
      lastMessage: message("m1", { authorId: PRIYA }),
      name: "Crew",
    }),
    conversation({ kind: "channel", members: [ME, MAYA, LEO, PRIYA] }),
  ];
  assert.deepEqual(asked(inboxIncludes(ME, rows)), [
    `getProfile {"accountId":"${MAYA}"}`,
    `getProfile {"accountId":"${PRIYA}"}`,
  ]);
});

void test("a group includes its members' profiles and its joins and leaves", () => {
  const group = conversation({});
  assert.deepEqual(
    asked(
      conversationIncludes(group, [
        { accountId: PRIYA, at: 1, eventId: "e1", kind: "left" },
      ]),
    ),
    [
      `memberEvents {"conversationId":"group:vera.chat:1"}`,
      `getProfile {"accountId":"${ME}"}`,
      `getProfile {"accountId":"${MAYA}"}`,
      `getProfile {"accountId":"${LEO}"}`,
      `getProfile {"accountId":"${PRIYA}"}`,
    ],
  );
  // A channel's members are its whole space: its messages include who
  // shows. Who's typing is never included (it would rerun the
  // conversation with every keystroke's refresh).
  assert.deepEqual(
    asked(conversationIncludes(conversation({ kind: "channel" }), [])),
    [],
  );
});

void test("a page includes its reactions, threads, and who it shows", async () => {
  const { ctx } = fakeCtx({
    threads: [
      {
        conversationId: "group:vera.chat:1",
        lastReplyAt: 1,
        replyCount: 1,
        repliers: [LEO, ME],
        threadId: "m1",
      },
    ],
  });
  const page = [
    message("m1"),
    message("m2", {
      authorId: LEO,
      quote: { authorId: PRIYA, body: "hi" },
      threadId: "m1",
    }),
  ];
  assert.deepEqual(asked(await pageIncludes(ctx, "group:vera.chat:1", page)), [
    `reactions {"conversationId":"group:vera.chat:1","messageIds":["m1","m2"]}`,
    `threadSummaries {"conversationId":"group:vera.chat:1","messageIds":["m1"]}`,
    `getProfile {"accountId":"${MAYA}"}`,
    `getProfile {"accountId":"${LEO}"}`,
    `getProfile {"accountId":"${PRIYA}"}`,
    `getProfile {"accountId":"${ME}"}`,
  ]);
});

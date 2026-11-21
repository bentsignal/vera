import assert from "node:assert/strict";
import test from "node:test";

import type { Message } from "./shapes.ts";
import { messagesProtocol } from "./protocol.ts";

// What a lying PDS (liar.test) can't make the app believe: messages,
// reactions, typing, and threads as accounts on other servers.

const { queries } = messagesProtocol;
const fromLiar = {
  owns: (accountId: string) => accountId.endsWith("@liar.test"),
};

function message(authorId: string, fields: Partial<Message> = {}): Message {
  return {
    attachments: [],
    authorId,
    authorName: authorId,
    body: "hi",
    conversationId: "c",
    linkPreview: null,
    messageId: `${authorId}-1`,
    sentAt: 1,
    ...fields,
  };
}

type Rule = (
  value: unknown,
  source: {
    args: Record<string, unknown>;
    owns: (accountId: string) => boolean;
  },
) => unknown;

/** What `name`'s rule believes of `value` from liar.test's PDS. */
function trust<Value>(
  name: keyof typeof queries,
  value: Value,
  args: Record<string, unknown> = {},
): Value {
  const operation: { trust?: unknown } = queries[name];
  assert.ok(
    operation.trust !== undefined,
    `${name} says what a PDS is believed about`,
  );
  // Each rule is checked with what a lying PDS could send, typed as its result.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const rule = operation.trust as Rule;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return rule.call(operation, value, { args, ...fromLiar }) as Value;
}

void test("every query gathered from several PDSs says what each is believed about", () => {
  for (const name of [
    "list",
    "reactions",
    "thread",
    "threadSummaries",
    "threads",
    "typing",
  ] as const) {
    assert.ok(queries[name].trust !== undefined, name);
  }
});

void test("a page leaves out messages a PDS sends as another server's accounts", () => {
  const forged = message("maya@vera.chat", {
    // Even reusing a real message's ID.
    messageId: "maya@vera.chat-1",
  });
  const own = message("mallory@liar.test");
  assert.deepEqual(
    trust("list", {
      hasNewer: false,
      hasOlder: false,
      messages: [forged, own],
    }),
    { hasNewer: false, hasOlder: false, messages: [own] },
  );
});

void test("a reply keeps who it quotes on another server, not the quoted words", () => {
  const reply = message("mallory@liar.test", {
    quote: {
      authorId: "maya@vera.chat",
      body: "words Maya never wrote",
      messageId: "maya-1",
    },
  });
  const page = trust("list", {
    hasNewer: false,
    hasOlder: false,
    messages: [reply],
  });
  assert.deepEqual(page.messages[0]?.quote, {
    authorId: "maya@vera.chat",
    body: "",
    messageId: "maya-1",
  });
});

void test("a thread's original is believed only from its author's PDS", () => {
  const page = trust("thread", {
    hasNewer: false,
    hasOlder: false,
    messages: [message("maya@vera.chat"), message("mallory@liar.test")],
    root: message("maya@vera.chat"),
  });
  assert.equal(page.root, null);
  assert.deepEqual(
    page.messages.map(({ authorId }) => authorId),
    ["mallory@liar.test"],
  );
});

void test("reactions and typing come only from their own accounts' PDS", () => {
  function reaction(accountId: string) {
    return { accountId, emoji: "👍", messageId: "m", reactedAt: 1 };
  }
  assert.deepEqual(
    trust("reactions", [
      reaction("maya@vera.chat"),
      reaction("mallory@liar.test"),
    ]),
    [reaction("mallory@liar.test")],
  );
  function typist(accountId: string) {
    return { accountId, expiresIn: 1, startedAt: 1, typedAt: 1 };
  }
  assert.deepEqual(
    trust("typing", [typist("maya@vera.chat"), typist("mallory@liar.test")]),
    [typist("mallory@liar.test")],
  );
});

void test("thread counts name only a PDS's own repliers", () => {
  assert.deepEqual(
    trust("threadSummaries", [
      {
        lastReplyAt: 1,
        replyCount: 40,
        repliers: ["maya@vera.chat"],
        threadId: "t1",
      },
      {
        lastReplyAt: 1,
        replyCount: 2,
        repliers: ["maya@vera.chat", "mallory@liar.test"],
        threadId: "t2",
      },
    ]),
    [
      {
        lastReplyAt: 1,
        replyCount: 2,
        repliers: ["mallory@liar.test"],
        threadId: "t2",
      },
    ],
  );
});

void test("thread lists leave out another server's originals and repliers", () => {
  const listing = {
    conversationId: "c",
    following: true,
    lastReadAt: null,
    lastReplyAt: 1,
    replyCount: 9,
    repliers: ["maya@vera.chat"],
    root: message("maya@vera.chat"),
    threadId: "t",
    unreadCount: 1,
  };
  assert.deepEqual(trust("threads", { hasMore: false, threads: [listing] }), {
    hasMore: false,
    threads: [],
  });
  const ownRoot = { ...listing, root: message("mallory@liar.test") };
  assert.deepEqual(
    trust("threads", { hasMore: false, threads: [ownRoot] }).threads,
    [{ ...ownRoot, replyCount: 0, repliers: [], unreadCount: 0 }],
  );
});

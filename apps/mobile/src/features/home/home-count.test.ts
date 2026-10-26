import assert from "node:assert/strict";
import { test } from "node:test";

import { countedChats, countsOnItsOwn, homeCount } from "./home-count.ts";

const conversations = [
  { alerts: "all", kind: "direct", muted: false, unreadCount: 3 },
  { alerts: "all", kind: "group", muted: false, unreadCount: 0 },
  { alerts: "mentions", kind: "group", muted: false, unreadCount: 2 },
  { alerts: "none", kind: "group", muted: true, unreadCount: 2 },
  { alerts: "all", kind: "channel", muted: false, unreadCount: 1 },
  // From a server before alert levels.
  { kind: "group", muted: false, unreadCount: 1 },
] as const;
const threads = [{ unreadCount: 2 }, { unreadCount: 0 }];

void test("counts each unread message in chats, and each unread channel once", () => {
  // 3 in the direct message, 1 in the group from before alert levels, and
  // the channel once.
  assert.equal(
    homeCount({ conversations, kinds: ["chats", "channels"], threads }),
    5,
  );
  assert.equal(homeCount({ conversations, kinds: ["chats"], threads }), 4);
  assert.equal(homeCount({ conversations, kinds: ["channels"], threads }), 1);
  // A channel from a PDS that still counted its messages counts once too.
  assert.equal(
    homeCount({
      conversations: [
        { alerts: "all", kind: "channel", muted: false, unreadCount: 12 },
      ],
      kinds: ["channels"],
      threads,
    }),
    1,
  );
});

void test("a mention or reply in a counted chat counts once, as its message", () => {
  const chats = [
    { alerts: "all", conversationId: "direct:a", kind: "direct", muted: false },
    {
      alerts: "mentions",
      conversationId: "group:b",
      kind: "group",
      muted: false,
    },
    {
      alerts: "all",
      conversationId: "channel:c",
      kind: "channel",
      muted: false,
    },
  ] as const;
  const counted = countedChats(chats, ["chats", "channels"]);
  assert.deepEqual([...counted], ["direct:a"]);
  function item(
    kind: "mention" | "reactions" | "reply",
    conversationId: string,
    threadOnly?: boolean,
  ) {
    return { conversation: { conversationId }, kind, message: { threadOnly } };
  }
  assert.equal(countsOnItsOwn(item("mention", "direct:a"), counted), false);
  assert.equal(countsOnItsOwn(item("reply", "direct:a"), counted), false);
  // Kept in a thread, it isn't one of the chat's messages.
  assert.equal(
    countsOnItsOwn(item("mention", "direct:a", true), counted),
    true,
  );
  // A group at Mentions and a channel don't count each message.
  assert.equal(countsOnItsOwn(item("mention", "group:b"), counted), true);
  assert.equal(countsOnItsOwn(item("reply", "channel:c"), counted), true);
  assert.equal(countsOnItsOwn(item("reactions", "direct:a"), counted), true);
});

void test("counts threads with unread replies when the Inbox lists them", () => {
  assert.equal(
    homeCount({ conversations: [], kinds: ["chats", "threads"], threads }),
    1,
  );
  assert.equal(homeCount({ conversations: [], kinds: [], threads }), 0);
});

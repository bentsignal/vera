import assert from "node:assert/strict";
import { test } from "node:test";

import type { NotificationScreen } from "./presentation.ts";
import { notificationIsNews } from "./presentation.ts";

const root = { accountId: "a@home", conversationId: "group:home:old" };
const reaction = { ...root, kind: "reaction" };
const screen = {
  foreground: true,
  inbox: false,
  activity: false,
} satisfies NotificationScreen;

void test("old offscreen reaction is quiet in its foreground chat or reaction sheet", () => {
  for (const field of ["conversation", "reactionSheet"] as const) {
    assert.equal(
      notificationIsNews(reaction, { ...screen, [field]: root }),
      false,
    );
    assert.equal(
      notificationIsNews(
        { ...reaction, threadId: "old-reply" },
        { ...screen, [field]: root },
      ),
      false,
    );
  }
});

void test("other account or conversation still receives reaction presentation", () => {
  for (const field of ["conversation", "reactionSheet"] as const) {
    const active = { ...screen, [field]: root };
    assert.equal(
      notificationIsNews({ ...reaction, accountId: "b@home" }, active),
      true,
    );
    assert.equal(
      notificationIsNews({ ...reaction, conversationId: "other" }, active),
      true,
    );
  }
});

void test("background is never suppressed by a retained screen", () => {
  const active = {
    ...screen,
    foreground: false,
    conversation: root,
    reactionSheet: root,
    activity: true,
    inbox: true,
  };
  assert.equal(notificationIsNews(reaction, active), true);
  assert.equal(notificationIsNews({ ...root, kind: "message" }, active), true);
});

void test("thread reaction uses its conversation while messages retain thread-specific policy", () => {
  const active = { ...screen, thread: { ...root, threadId: "thread-a" } };
  assert.equal(
    notificationIsNews({ ...reaction, threadId: "thread-b" }, active),
    false,
  );
  assert.equal(
    notificationIsNews(
      { ...root, kind: "message", threadId: "thread-a" },
      active,
    ),
    false,
  );
  assert.equal(
    notificationIsNews(
      { ...root, kind: "message", threadId: "thread-b" },
      active,
    ),
    true,
  );
});

void test("sheet suppresses reactions only; Activity and Inbox keep their distinct policies", () => {
  assert.equal(
    notificationIsNews(
      { ...root, kind: "message" },
      { ...screen, reactionSheet: root },
    ),
    true,
  );
  assert.equal(notificationIsNews(reaction, { ...screen, inbox: true }), true);
  assert.equal(
    notificationIsNews(reaction, { ...screen, activity: true }),
    false,
  );
  assert.equal(
    notificationIsNews(
      { ...root, kind: "message" },
      { ...screen, inbox: true },
    ),
    false,
  );
  assert.equal(
    notificationIsNews({ kind: "spaceInvite" }, { ...screen, activity: true }),
    true,
  );
});

void test("legacy payload without account still matches its globally identified conversation", () => {
  assert.equal(
    notificationIsNews(
      { conversationId: root.conversationId, kind: "reaction" },
      { ...screen, conversation: root },
    ),
    false,
  );
});

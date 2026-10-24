import assert from "node:assert/strict";
import test from "node:test";

import type {
  PageCursor,
  PageData,
  View,
  WindowMessage,
} from "./window-model.ts";
import {
  advance,
  anchoredView,
  latestView,
  MAX_REUSED_PAGES,
  mergePages,
  pageKey,
  reusable,
  windowParts,
} from "./window-model.ts";

// A conversation on a fake PDS that answers pages like the real one: 50
// messages a page, `after` newer than its cursor and `before` older.

const PAGE = 50;

function conversation() {
  const messages = new Array<WindowMessage>();
  return {
    messages,
    send(sentAt: number, messageId = `m${sentAt}`, threadId?: string) {
      messages.push({ messageId, sentAt, threadId });
      messages.sort((left, right) => left.sentAt - right.sentAt);
    },
    page(cursor: PageCursor): PageData {
      if ("after" in cursor) {
        const newer = messages.filter(({ sentAt }) => sentAt > cursor.after);
        return {
          hasNewer: newer.length > PAGE,
          hasOlder: true,
          messages: newer.slice(0, PAGE),
        };
      }
      if ("before" in cursor) {
        const older = messages.filter(({ sentAt }) => sentAt < cursor.before);
        return {
          hasNewer: true,
          hasOlder: older.length > PAGE,
          messages: older.slice(-PAGE),
        };
      }
      const at = messages.findIndex(
        ({ messageId }) => messageId === cursor.around,
      );
      const start = Math.max(0, at - PAGE / 2);
      return {
        hasNewer: messages.length > at + PAGE / 2,
        hasOlder: start > 0,
        messages: messages.slice(start, at + PAGE / 2),
      };
    },
  };
}

type Conversation = ReturnType<typeof conversation>;

function results(chat: Conversation, view: View, fresh = true) {
  return view.pages.map((cursor) => ({
    at: 0,
    data: chat.page(cursor),
    fresh,
  }));
}

/** Runs `advance` until the window settles, as the hook does each render. */
function settle(chat: Conversation, view: View) {
  let current = view;
  for (let step = 0; step < 100; step += 1) {
    const next = advance(current, results(chat, current));
    if (next === "behind") return "behind" as const;
    if (next === undefined) return current;
    current = next.view;
  }
  throw new Error("The window never settled");
}

/** `settle`, for a window that must not fall behind. */
function settled(chat: Conversation, view: View) {
  const next = settle(chat, view);
  if (next === "behind") throw new Error("The window fell behind");
  return next;
}

function shown(chat: Conversation, view: View) {
  return mergePages(view.pages.map((cursor) => chat.page(cursor))).map(
    ({ messageId }) => messageId,
  );
}

function history(chat: Conversation, count: number) {
  for (let index = 1; index <= count; index += 1) chat.send(index);
}

/** Random order, as separate requests reach the PDS. */
function shuffled(values: readonly number[], seed = 7) {
  const result = [...values];
  let state = seed;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    const other = state % (index + 1);
    [result[index], result[other]] = [result[other] ?? 0, result[index] ?? 0];
  }
  return result;
}

void test("a burst of 300 is followed page by page with nothing lost or doubled", () => {
  const chat = conversation();
  history(chat, 80);
  let view = latestView(1_000);
  const burst = shuffled(Array.from({ length: 300 }, (_, i) => 1_001 + i));
  for (const sentAt of burst.toSorted((left, right) => left - right)) {
    chat.send(sentAt);
    view = settled(chat, view);
  }
  const ids = shown(chat, view);
  // The frozen page's 50, and every message of the burst, once each.
  assert.equal(ids.length, 350);
  assert.equal(new Set(ids).size, 350);
  assert.equal(ids.at(-1), "m1300");
  // The frozen page, then 300 messages 49 new a page (each page starts
  // with the last of the one before): seven.
  assert.equal(view.pages.length, 1 + 7);
  assert.equal(view.liveSince, 1_000);
});

void test("messages sent the same millisecond across a page boundary all show", () => {
  const chat = conversation();
  let view = latestView(0);
  for (let index = 0; index < 49; index += 1) chat.send(index + 1);
  view = settled(chat, view);
  // The 50th and 51st arrive at once, both at 50.
  chat.send(50, "a");
  chat.send(50, "b");
  chat.send(51, "c");
  view = settled(chat, view);
  const ids = shown(chat, view);
  assert.ok(ids.includes("a") && ids.includes("b") && ids.includes("c"));
});

void test("a window more than a page behind opens again instead of filling in", () => {
  const chat = conversation();
  history(chat, 60);
  const view = settled(chat, latestView(60));
  // Away for a while: 120 more arrive.
  for (let index = 61; index <= 180; index += 1) chat.send(index);
  // Reopened from cache: the copy is behind, and isn't followed yet.
  const reopened = { ...view, followed: [] };
  assert.equal(advance(reopened, results(chat, reopened, false)), undefined);
  // Fresh from the PDS: the newest page is already full.
  assert.equal(advance(reopened, results(chat, reopened)), "behind");
});

void test("a cached copy isn't followed until the PDS confirms it", () => {
  const chat = conversation();
  history(chat, 10);
  const view = latestView(10);
  assert.equal(advance(view, results(chat, view, false)), undefined);
  const next = advance(view, results(chat, view));
  assert.ok(next !== undefined && next !== "behind");
  assert.deepEqual(next.view.followed, [pageKey({ after: 10 })]);
});

void test("a window opened in older messages follows once it reaches the latest", () => {
  const chat = conversation();
  history(chat, 120);
  let view = anchoredView("m100");
  // Its page reaches the newest message: it follows from there.
  view = settled(chat, view);
  assert.equal(view.liveSince, 120);
  for (let index = 121; index <= 200; index += 1) {
    chat.send(index);
    view = settled(chat, view);
  }
  assert.equal(shown(chat, view).at(-1), "m200");

  // Opened far back, it doesn't follow: the list pages down as it scrolls.
  const far = anchoredView("m10");
  assert.equal(advance(far, results(chat, far)), undefined);
});

void test("reactions and threads: fixed batches before the window went live, by time after", () => {
  const chat = conversation();
  history(chat, 5);
  let view = latestView(5);
  chat.send(6);
  chat.send(7, "reply", "m3");
  view = settled(chat, view);
  const parts = windowParts(
    view,
    view.pages.map((cursor) => chat.page(cursor)),
  );
  assert.deepEqual(parts.messageIds, [["m1", "m2", "m3", "m4", "m5"], []]);
  assert.deepEqual(parts.liveIds, ["m6", "reply"]);
  assert.deepEqual(parts.liveThreadIds, ["m6", "m3"]);
  assert.equal(parts.since, 5);
  // A new message changes none of the batches.
  chat.send(8);
  const later = windowParts(
    view,
    view.pages.map((cursor) => chat.page(cursor)),
  );
  assert.deepEqual(later.messageIds, parts.messageIds);
  assert.deepEqual(later.threadIds, parts.threadIds);
});

void test("only a recent, current window under the page limit opens again", () => {
  const chat = conversation();
  history(chat, 30);
  const view = settled(chat, latestView(30));
  const last = chat.page({ after: 30 });
  const fresh = { age: 0, maxAge: 1_000 };
  assert.equal(reusable(view, last, fresh), true);
  assert.equal(reusable(view, last, { age: 1_000, maxAge: 1_000 }), false);
  assert.equal(reusable(view, { ...last, hasNewer: true }, fresh), false);
  const long = {
    ...view,
    pages: Array.from({ length: MAX_REUSED_PAGES + 1 }, (_, after) => ({
      after,
    })),
  };
  assert.equal(reusable(long, last, fresh), false);
  assert.equal(reusable(anchoredView("m1"), last, fresh), false);
});

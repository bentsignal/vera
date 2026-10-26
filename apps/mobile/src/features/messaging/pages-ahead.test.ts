import assert from "node:assert/strict";
import test from "node:test";

import type { PageCursor, PageData, WindowMessage } from "./window-model.ts";
import {
  anchoredView,
  latestView,
  pageAfter,
  pagesAhead,
  withPage,
} from "./window-model.ts";

// A conversation on a fake PDS that answers pages of 50, like the real one.

const PAGE = 50;

function conversation() {
  const messages = new Array<WindowMessage>();
  return {
    send(sentAt: number) {
      messages.push({ messageId: `m${String(sentAt)}`, sentAt });
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

void test("asks for the next older page ahead once the reader scrolls up", () => {
  const chat = conversation();
  for (let at = 1; at <= 200; at += 1) chat.send(at);
  const view = latestView(1000);
  const opened = view.pages.map((cursor) => chat.page(cursor));
  // Just opened: nothing ahead yet.
  assert.deepEqual(pagesAhead(view, opened), []);
  const oldest = opened[0]?.messages[0];
  assert.ok(oldest !== undefined);
  const scrolled = withPage(view, { before: oldest.sentAt }, "start");
  const pages = scrolled.pages.map((cursor) => chat.page(cursor));
  assert.deepEqual(pagesAhead(scrolled, pages), [
    { before: pages[0]?.messages[0]?.sentAt },
  ]);
  // The oldest page reached: nothing older to ask for.
  const top = withPage(view, { before: 51 }, "start");
  assert.deepEqual(
    pagesAhead(
      top,
      top.pages.map((cursor) => chat.page(cursor)),
    ),
    [],
  );
});

void test("asks for the next newer page ahead in older messages", () => {
  const chat = conversation();
  for (let at = 1; at <= 300; at += 1) chat.send(at);
  const view = anchoredView("m100");
  const first = chat.page({ around: "m100" });
  assert.deepEqual(pagesAhead(view, [first]), []);
  const newest = first.messages.at(-1);
  assert.ok(newest !== undefined);
  const scrolled = withPage(view, pageAfter(newest), "end");
  const pages = scrolled.pages.map((cursor) => chat.page(cursor));
  assert.deepEqual(pagesAhead(scrolled, pages), [
    pageAfter(pages.at(-1)?.messages.at(-1) ?? newest),
  ]);
});

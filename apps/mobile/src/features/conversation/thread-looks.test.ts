import assert from "node:assert/strict";
import { test } from "node:test";

import type { Row } from "../native-list/contract.ts";
import type { LookContext, ThreadLook } from "./thread-looks.ts";
import {
  LEO,
  MAYA,
  message,
  context as rowContext,
} from "../native-list/map-rows.testing.ts";
import { nativeRows } from "../native-list/map-rows.ts";
import { newestFirst } from "./build-rows.ts";
import { lookRows, THREAD_LOOKS } from "./thread-looks.ts";

// The thread from Shawn's screenshot: an original from yesterday evening,
// and its replies this morning.
const DAY = 24 * 60;
const root = message("root", -DAY + 12 * 60);
const replies = [
  message("a", 0, { authorId: LEO }),
  message("b", 1, { authorId: LEO }),
  message("c", 2),
  message("d", 16, { authorId: LEO }),
  message("e", 17, { authorId: LEO }),
];

function threadRows(layout: "bubbles" | "stacked" = "stacked") {
  const built = newestFirst(replies, layout, { replyCount: 5, root });
  return nativeRows(built, [], rowContext({ layout }));
}

function look(id: ThreadLook, extra: Partial<LookContext> = {}) {
  return lookRows(id, threadRows(), {
    customRows: true,
    now: rowContext().now,
    replyCount: 5,
    rootId: "root",
    title: "#general",
    ...extra,
  });
}

/** Each row oldest first: its id, and a header's label. */
function shape(rows: readonly Row[]) {
  return [...rows]
    .reverse()
    .map((row) => (row.kind === "header" ? `${row.id}: ${row.label}` : row.id));
}

void test("today's thread stacks a day header under its divider", () => {
  assert.deepEqual(shape(look("current")), [
    "day-root: Yesterday",
    "root",
    "replies: 5 replies",
    "day-a: Today",
    "a",
    "b",
    "c",
    "d",
    "e",
  ]);
});

void test("the merged divider carries the replies' day", () => {
  assert.deepEqual(shape(look("merged")), [
    "root",
    "replies: 5 replies · Today",
    "a",
    "b",
    "c",
    "d",
    "e",
  ]);
});

void test("without day dividers, the times carry the day", () => {
  const rows = look("quiet");
  assert.deepEqual(shape(rows), [
    "root",
    "replies: 5 replies",
    "a",
    "b",
    "c",
    "d",
    "e",
  ]);
  const original = rows.find((row) => row.id === "root");
  assert.match(
    original?.kind === "message" ? original.timeLabel : "",
    /^Yesterday/u,
  );
});

void test("custom looks fall back to the merged divider without React rows", () => {
  for (const id of [
    "title",
    "post",
    "section",
    "comments",
    "origin",
  ] as const) {
    assert.deepEqual(
      shape(look(id, { customRows: false })),
      shape(look("merged")),
    );
  }
});

void test("the post's details replace the divider", () => {
  const rows = look("post");
  assert.deepEqual(shape(rows), ["root", "look-post", "a", "b", "c", "d", "e"]);
  const post = rows.find((row) => row.id === "look-post");
  assert.equal(
    post?.kind === "custom" ? Reflect.get(post.props ?? {}, "people") : 0,
    2,
  );
  const original = rows.find((row) => row.id === "root");
  assert.equal(original?.kind === "message" ? original.timeLabel : "", "");
});

void test("the section takes the first day and keeps later ones as subheads", () => {
  const later = message("f", DAY, { authorId: MAYA });
  const built = newestFirst([...replies, later], "stacked", {
    replyCount: 6,
    root,
  });
  const now = new Date(rowContext().now.getTime() + DAY * 60_000);
  const rows = lookRows(
    "section",
    nativeRows(built, [], rowContext({ layout: "stacked", now })),
    { customRows: true, now, replyCount: 6, rootId: "root", title: "" },
  );
  assert.deepEqual(shape(rows), [
    "root",
    "look-section",
    "a",
    "b",
    "c",
    "d",
    "e",
    "look-day-f",
    "f",
  ]);
});

void test("every look keeps every message, in order", () => {
  for (const { id } of THREAD_LOOKS) {
    const ids = shape(look(id)).filter((row) => /^[a-e]$|^root$/u.test(row));
    assert.deepEqual(ids, ["root", "a", "b", "c", "d", "e"], id);
  }
});

void test("bubbles drop their time headers and get the day in revealed times", () => {
  const rows = lookRows("quiet", threadRows("bubbles"), {
    customRows: true,
    now: rowContext().now,
    replyCount: 5,
    rootId: "root",
    title: "",
  });
  assert.ok(rows.every((row) => row.kind !== "header" || row.id === "replies"));
  const reply = rows.find((row) => row.id === "a");
  assert.equal(reply?.kind === "message" ? reply.timeLabel : "", "9:00 AM");
});

import assert from "node:assert/strict";
import { test } from "node:test";

import type { MessageRow } from "./contract.ts";
import { newestFirst } from "../conversation/build-rows.ts";
import { V1_BLOCK_TYPES, V1_ROW_KINDS } from "./contract.ts";
import {
  at,
  blockAt,
  context,
  isBlock,
  isMessage,
  LEO,
  MAYA,
  ME,
  message,
  messageRows,
  only,
  photo,
  rowAt,
  rowsOf,
  START,
} from "./map-rows.testing.ts";
import { nativeRows, supported } from "./map-rows.ts";

function typesOf(row: MessageRow) {
  return row.blocks.map((block) => block.type);
}

void test("rows come newest first, with a header over the oldest", () => {
  const rows = rowsOf([message("a", 0), message("b", 1), message("c", 2)]);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["c", "b", "a", "time-a"],
  );
  const header = rowAt(rows, 3, "header");
  assert.equal(header.style, "time");
  assert.match(header.label, /^Today · /);
});

void test("a thread's divider sits under its original", () => {
  function divider(replyCount: number) {
    const root = message("root", 0);
    const replies = replyCount === 0 ? [] : [message("reply", 1)];
    const rows = nativeRows(
      newestFirst(replies, "bubbles", { replyCount, root }),
      [],
      context(),
    );
    const found = rows.find(
      (row) => row.kind === "header" && row.style === "replies",
    );
    assert.ok(found?.kind === "header");
    return found.label;
  }
  assert.equal(divider(3), "3 replies");
  assert.equal(divider(1), "1 reply");
  assert.equal(divider(0), "No replies yet");
});

void test("stacked rows get day separators", () => {
  const rows = rowsOf([message("a", 0)], { layout: "stacked" });
  const header = rowAt(rows, 1, "header");
  assert.equal(header.style, "day");
  assert.equal(header.label, "Today");
});

void test("stacked rows date yesterday's messages; bubbles keep the time", () => {
  const nextDay = { now: new Date(START + 24 * 60 * 60_000) };
  const stacked = only(
    messageRows(rowsOf([message("a", 0)], { ...nextDay, layout: "stacked" })),
  );
  assert.match(stacked.timeLabel, /^Yesterday · /);
  assert.match(stacked.accessibilityLabel, /Yesterday, /);
  const bubbles = only(messageRows(rowsOf([message("a", 0)], nextDay)));
  assert.doesNotMatch(bubbles.timeLabel, /Yesterday/);
});

void test("runs: the first starts the group, the last ends it", () => {
  const rows = messageRows(
    rowsOf([message("a", 0), message("b", 1), message("c", 2)]),
  );
  assert.deepEqual(
    rows.map((row) => [row.id, row.startsGroup, row.endsGroup]),
    [
      ["c", false, true],
      ["b", false, false],
      ["a", true, false],
    ],
  );
});

void test("authors: initials, photos, and who's own", () => {
  const rows = messageRows(
    rowsOf([
      message("a", 0, { authorId: LEO }),
      message("b", 5, { authorId: ME }),
    ]),
  );
  const mine = at(rows, 0);
  const leos = at(rows, 1);
  assert.equal(leos.author.initials, "LP");
  assert.equal(leos.author.avatarUrl, "https://example.com/leo.jpg");
  assert.equal(leos.showAuthor, true);
  assert.equal(leos.isOwn, false);
  assert.equal(mine.isOwn, true);
  // Bubbles never name your own; stacked rows name everyone.
  assert.equal(mine.showAuthor, false);
  const stacked = messageRows(
    rowsOf([message("b", 5, { authorId: ME })], { layout: "stacked" }),
  );
  assert.equal(only(stacked).showAuthor, true);
});

void test("direct chats don't show the other person's name", () => {
  const rows = messageRows(rowsOf([message("a", 0)], { showAuthors: false }));
  assert.equal(only(rows).showAuthor, false);
});

void test("photos and videos are one media block, each with its reactions", () => {
  const video = {
    ...photo("clip.mp4"),
    durationMs: 12_500,
    kind: "video" as const,
    thumbnailUrl: "https://example.com/poster.jpg",
  };
  const file = {
    ...photo("plans.pdf"),
    kind: "file" as const,
    size: 2_400_000,
  };
  const reactions = [
    { accounts: [ME], count: 1, emoji: "👍", mine: true, part: 2 },
    { accounts: [LEO], count: 1, emoji: "❤️", mine: false, part: "message" },
  ] as const;
  const attachments = [photo("one.jpg"), file, video, photo("two.jpg", 0, 0)];
  const row = only(
    messageRows(
      rowsOf([message("a", 0, { attachments, body: "look", reactions })]),
    ),
  );
  // Bubbles: the media where the first photo is, the file in place, then
  // the text.
  assert.deepEqual(typesOf(row), ["media", "file", "text"]);
  const media = blockAt(row, 0, "media");
  assert.deepEqual(
    media.items.map((item) => [item.kind, item.part]),
    [
      ["image", "0"],
      ["video", "2"],
      ["image", "3"],
    ],
  );
  assert.equal(media.part, undefined);
  const clip = at(media.items, 1);
  assert.equal(clip.durationSeconds, 12.5);
  assert.equal(clip.thumbnailUrl, "https://example.com/poster.jpg");
  assert.deepEqual(clip.reactions, [
    { content: { emoji: "👍" }, count: 1, key: "2 👍", mine: true },
  ]);
  // A photo without a size draws square.
  const unsized = at(media.items, 2);
  assert.deepEqual([unsized.width, unsized.height], [1000, 1000]);
  // The text's reactions are the row's.
  assert.deepEqual(row.reactions, [
    { content: { emoji: "❤️" }, count: 1, key: "message ❤️", mine: false },
  ]);
  assert.equal(blockAt(row, 1, "file").sizeLabel, "2.4 MB");
});

void test("stacked rows put the text first", () => {
  const rows = rowsOf(
    [message("a", 0, { attachments: [photo("one.jpg")], body: "hi" })],
    { layout: "stacked" },
  );
  const row = only(messageRows(rows));
  assert.deepEqual(typesOf(row), ["text", "media"]);
  // One photo alone is the block's own part.
  assert.equal(blockAt(row, 1, "media").part, "0");
});

void test("a photo without text is the message's own part", () => {
  const reactions = [
    { accounts: [LEO], count: 1, emoji: "😂", mine: false, part: "message" },
  ] as const;
  const shown = message("a", 0, {
    attachments: [photo("one.jpg")],
    body: undefined,
    reactions,
  });
  const row = only(messageRows(rowsOf([shown])));
  const item = at(blockAt(row, 0, "media").items, 0);
  assert.equal(item.part, "message");
  assert.equal(item.reactions.length, 1);
  // Not shown twice.
  assert.deepEqual(row.reactions, []);
});

void test("link cards and a thread's count", () => {
  const shown = message("a", 0, {
    body: "https://youtube.com/watch?v=1",
    linkPreviews: [
      {
        link: "https://youtube.com/watch?v=1",
        preview: {
          siteName: "YouTube",
          title: "A video",
          url: "https://youtube.com/watch?v=1",
        },
      },
      { link: "https://www.example.com/x", preview: null },
    ],
    thread: { repliers: [LEO], replyCount: 3 },
  });
  const row = only(messageRows(rowsOf([shown])));
  assert.deepEqual(typesOf(row), ["linkCard", "linkCard"]);
  const first = blockAt(row, 0, "linkCard");
  const second = blockAt(row, 1, "linkCard");
  assert.equal(first.site, "YouTube");
  // Its text is only the link, so the first card is the message.
  assert.equal(first.part, "message");
  assert.equal(second.site, "example.com");
  assert.equal(second.part, "link-1");
  assert.deepEqual(
    row.footer.map((line) => [line.kind, line.text]),
    [["replies", "3 replies"]],
  );
  assert.deepEqual(
    at(row.footer, 0).people?.map((person) => person.name),
    ["Leo Park"],
  );
});

void test("a reply's quote and footer lines", () => {
  const shown = message("b", 1, {
    editedAt: new Date(START + 2 * 60_000),
    quote: { authorId: LEO, body: "the original", messageId: "q" },
    status: "failed",
    thread: { repliers: [LEO], replyCount: 2 },
    threadId: "q",
  });
  const row = only(messageRows(rowsOf([shown])));
  const quote = blockAt(row, 0, "quote");
  assert.equal(quote.messageId, "q");
  assert.equal(quote.text, "the original");
  assert.equal(quote.author.name, "Leo Park");
  assert.deepEqual(
    row.footer.map((line) => [line.kind, line.text]),
    [
      ["replies", "View 1 more reply"],
      ["edited", "Edited"],
      ["notSent", "Not sent. Tap to try again."],
    ],
  );
  assert.equal(row.status, "failed");
});

void test("a deleted original is one deleted block", () => {
  const shown = message("a", 0, {
    body: undefined,
    deleted: true,
    thread: { repliers: [], replyCount: 1 },
  });
  const row = only(messageRows(rowsOf([shown])));
  assert.deepEqual(row.blocks, [
    { label: "This message was deleted", type: "deleted" },
  ]);
});

void test("arrivals, the anchor, and the accessibility label", () => {
  const rows = messageRows(
    rowsOf([message("old", 0), message("new", 45)], { anchorId: "old" }),
  );
  const arrived = at(rows, 0);
  const old = at(rows, 1);
  assert.equal(arrived.arrived, true);
  assert.equal(old.arrived, undefined);
  assert.equal(old.highlighted, true);
  assert.match(old.accessibilityLabel, /^Maya Chen, old, /);
});

void test("who's typing is the newest row", () => {
  const rows = rowsOf([message("a", 0)], {}, [MAYA, LEO]);
  const typing = rowAt(rows, 0, "typing");
  assert.equal(typing.label, "Maya and Leo are typing");
  assert.equal(typing.people.length, 2);
  assert.equal(typing.showFaces, true);
});

void test("one-on-one, who's typing shows photos in stacked rows only", () => {
  for (const layout of ["bubbles", "stacked"] as const) {
    const rows = rowsOf([message("a", 0)], { layout, showAuthors: false }, [
      MAYA,
    ]);
    const typing = rowAt(rows, 0, "typing");
    assert.equal(typing.showFaces, layout === "stacked");
    // Still sent, for the hand-off to their message.
    assert.equal(typing.people[0]?.id, MAYA);
  }
});

void test("what a binary can't draw falls back", () => {
  const rows = rowsOf([
    message("a", 0, { attachments: [photo("one.jpg")], body: "hi" }),
  ]);
  const row = only(messageRows(rows));
  const noMedia = supported(row, {
    blockTypes: ["text"],
    rowKinds: V1_ROW_KINDS,
  });
  assert.ok(isMessage(noMedia));
  assert.deepEqual(
    noMedia.blocks.map((block) =>
      isBlock(block, "text") ? block.spans.map((span) => span.text) : [],
    ),
    [["Photo"], ["hi"]],
  );
  const noMessages = supported(row, {
    blockTypes: V1_BLOCK_TYPES,
    rowKinds: ["header"],
  });
  assert.deepEqual(noMessages, {
    component: "message",
    fallbackText: "Maya Chen: hi, Photo",
    id: "a",
    kind: "custom",
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";

import type { PhotoMark, PhotoStep } from "./photo-timing-log.ts";
import { createTimingLog, photoOpens } from "./photo-timing-log.ts";

const PHOTO = "https://example.com/third.jpg";
const NEIGHBOR = "https://example.com/second.jpg";

function mark(step: PhotoStep, at: number, url?: string) {
  return { at, step, url, wall: 1_000_000 + at } satisfies PhotoMark;
}

void test("each step is timed from the press, for the photo pressed", () => {
  const [open] = photoOpens([
    { ...mark("press", 100, PHOTO), index: 2 },
    mark("viewerLayout", 180),
    // The page beside it lays out and loads first: not the one pressed.
    mark("pageLayout", 190, NEIGHBOR),
    mark("load", 400, NEIGHBOR),
    mark("pageLayout", 195, PHOTO),
    mark("loadStart", 196, PHOTO),
    mark("load", 700, PHOTO),
    mark("display", 716, PHOTO),
  ]);
  assert.deepEqual(open, {
    display: 616,
    index: 2,
    load: 600,
    loadStart: 96,
    pageLayout: 95,
    pressedAt: 1_000_100,
    url: PHOTO,
    viewerLayout: 80,
  });
});

void test("a step that never came is missing, not zero", () => {
  const [open] = photoOpens([
    mark("press", 0, PHOTO),
    mark("viewerLayout", 50),
  ]);
  assert.equal(open?.load, undefined);
  assert.equal(open?.display, undefined);
});

void test("a second open doesn't take the first one's steps", () => {
  const opens = photoOpens([
    mark("press", 0, PHOTO),
    mark("load", 300, PHOTO),
    mark("press", 1000, PHOTO),
    mark("load", 1050, PHOTO),
  ]);
  assert.deepEqual(
    opens.map((open) => open.load),
    [300, 50],
  );
});

void test("the log keeps only the newest marks", () => {
  const log = createTimingLog(3);
  for (const at of [1, 2, 3, 4, 5]) log.mark(mark("load", at, PHOTO));
  assert.deepEqual(
    log.marks().map((each) => each.at),
    [3, 4, 5],
  );
  log.reset();
  assert.equal(log.marks().length, 0);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MIN_VIDEO_BITS_PER_SECOND,
  retryBitrate,
  videoBitrate,
} from "./video-budget.ts";

const LIMIT = 50_000_000;

void test("a minute of video fits under 50 MB with room for the sound", () => {
  const bitrate = videoBitrate(60_000, LIMIT, 60_000);
  const bytes = ((bitrate + 256_000) * 60) / 8;
  assert.ok(bytes <= LIMIT * 0.9, String(bytes));
  assert.ok(bitrate > 5_000_000, String(bitrate));
});

void test("a short video doesn't get more than 1080p needs", () => {
  assert.equal(videoBitrate(20_000, LIMIT, 60_000), 6_000_000);
});

void test("an unknown length counts as the longest video", () => {
  assert.equal(
    videoBitrate(undefined, LIMIT, 60_000),
    videoBitrate(60_000, LIMIT, 60_000),
  );
});

void test("a try that came out too big goes lower in proportion", () => {
  const next = retryBitrate(5_700_000, 55_000_000, LIMIT);
  assert.notEqual(next, null);
  assert.ok(Number(next) < 5_700_000);
  assert.ok((Number(next) * 55_000_000) / 5_700_000 <= LIMIT);
});

void test("there's no second try below a watchable bitrate", () => {
  assert.equal(retryBitrate(1_100_000, 200_000_000, LIMIT), null);
  assert.equal(retryBitrate(MIN_VIDEO_BITS_PER_SECOND + 1, LIMIT, LIMIT), null);
});

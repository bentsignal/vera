import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MIN_VIDEO_BITS_PER_SECOND,
  photoOverCap,
  retryBitrate,
  videoBitrate,
  videoOverCap,
} from "./media-budget.ts";

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

const IMAGE_LIMIT = 10_000_000;
const minute = { durationMs: 60_000, mimeType: "video/mp4" };

void test("a 1080p video at a phone's usual bitrate shrinks", () => {
  // Shawn's 52-second, 67 MB iPhone clip.
  assert.equal(
    videoOverCap(
      {
        ...minute,
        durationMs: 52_000,
        height: 1920,
        size: 67_000_000,
        width: 1080,
      },
      LIMIT,
    ),
    true,
  );
});

void test("a 4K video shrinks even when it's short and small", () => {
  assert.equal(
    videoOverCap(
      {
        ...minute,
        durationMs: 3_000,
        height: 2160,
        size: 4_000_000,
        width: 3840,
      },
      LIMIT,
    ),
    true,
  );
});

void test("a 1080p video already at about 6 Mbps goes as it is", () => {
  assert.equal(
    videoOverCap(
      { ...minute, height: 1080, size: 45_000_000, width: 1920 },
      LIMIT,
    ),
    false,
  );
  assert.equal(
    videoOverCap(
      { ...minute, height: 720, size: 10_000_000, width: 1280 },
      LIMIT,
    ),
    false,
  );
});

void test("a video of unknown size or length shrinks", () => {
  assert.equal(videoOverCap({ ...minute, size: 1_000_000 }, LIMIT), true);
  assert.equal(
    videoOverCap(
      { height: 1080, mimeType: "video/mp4", size: 1_000_000, width: 1920 },
      LIMIT,
    ),
    true,
  );
});

void test("a full-size phone photo shrinks; a small one goes as it is", () => {
  const photo = { mimeType: "image/heic", size: 2_800_000 };
  assert.equal(
    photoOverCap({ ...photo, height: 3024, width: 4032 }, IMAGE_LIMIT),
    true,
  );
  assert.equal(
    photoOverCap({ ...photo, height: 1536, width: 2048 }, IMAGE_LIMIT),
    false,
  );
  assert.equal(
    photoOverCap({ ...photo, height: 900, width: 1200 }, IMAGE_LIMIT),
    false,
  );
});

void test("a photo of unknown size shrinks, and a GIF never does", () => {
  assert.equal(
    photoOverCap({ mimeType: "image/jpeg", size: 100 }, IMAGE_LIMIT),
    true,
  );
  assert.equal(
    photoOverCap(
      { height: 4000, mimeType: "image/gif", size: 9_000_000, width: 4000 },
      IMAGE_LIMIT,
    ),
    false,
  );
});

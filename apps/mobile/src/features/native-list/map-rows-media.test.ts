import assert from "node:assert/strict";
import { test } from "node:test";

import {
  blockAt,
  message,
  messageRows,
  only,
  photo,
  rowsOf,
} from "./map-rows.testing.ts";

void test("a video being sent shows its poster, not its video file", () => {
  const clip = {
    ...photo("clip.mp4"),
    kind: "video" as const,
    localThumbnailUrl: "file:///cache/poster.jpg",
    localUrl: "file:///cache/clip.mp4",
    thumbnailUrl: "https://example.com/poster.jpg",
  };
  const still = { ...photo("one.jpg"), localUrl: "file:///cache/one.jpg" };
  const row = only(
    messageRows(rowsOf([message("a", 0, { attachments: [clip, still] })])),
  );
  const [video, image] = blockAt(row, 0, "media").items;
  // iOS draws `localUrl` as a picture before anything else.
  assert.equal(video?.localUrl, undefined);
  assert.equal(video?.thumbnailUrl, "file:///cache/poster.jpg");
  assert.equal(image?.localUrl, "file:///cache/one.jpg");
});

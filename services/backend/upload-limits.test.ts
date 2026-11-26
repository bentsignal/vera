import assert from "node:assert/strict";
import { test } from "node:test";

import type { UploadRecord } from "./upload-limits.ts";
import {
  localAccountId,
  MAX_UNCHECKED_UPLOADS,
  MAX_UPLOAD_BYTES,
  reservedBytes,
  UPLOAD_WINDOW_BYTES,
  UPLOAD_WINDOW_MS,
  uploadContentType,
  uploadExtension,
  uploadOversize,
  uploadRefusal,
  uploadSizeAllowed,
} from "./upload-limits.ts";

const NOW = 1_800_000_000_000;

function checked(bytes: number, agoMs = 60_000): UploadRecord {
  return { bytes, checked: true, createdAt: NOW - agoMs };
}

void test("an unknown size (0) is allowed, as older apps send for video posters", () => {
  assert.equal(uploadSizeAllowed("image", 0), true);
  assert.equal(uploadSizeAllowed("video", 0), true);
});

void test("the limits are photos 10 MB, other files 20 MB, videos 50 MB", () => {
  assert.deepEqual(MAX_UPLOAD_BYTES, {
    file: 20_000_000,
    image: 10_000_000,
    video: 50_000_000,
  });
});

void test("each kind stops at its limit", () => {
  for (const kind of ["file", "image", "video"] as const) {
    assert.equal(uploadSizeAllowed(kind, MAX_UPLOAD_BYTES[kind]), true);
    assert.equal(uploadSizeAllowed(kind, MAX_UPLOAD_BYTES[kind] + 1), false);
  }
});

void test("negative and non-numeric sizes are refused", () => {
  assert.equal(uploadSizeAllowed("image", -1), false);
  assert.equal(uploadSizeAllowed("image", Number.NaN), false);
  assert.equal(uploadSizeAllowed("image", Number.POSITIVE_INFINITY), false);
});

void test("a new account can upload", () => {
  assert.equal(uploadRefusal([], "video", 40_000_000, NOW), null);
});

void test("an upload claiming more than its kind allows is refused", () => {
  assert.equal(uploadRefusal([], "image", 10_000_001, NOW), "UPLOAD_TOO_LARGE");
});

void test("the day's allowance runs out", () => {
  const used = Array.from({ length: 39 }, () => checked(50_000_000));
  assert.equal(uploadRefusal(used, "video", 50_000_000, NOW), null);
  const full = [...used, checked(50_000_000)];
  assert.equal(
    uploadRefusal(full, "image", 1_000, NOW),
    "UPLOAD_LIMIT_REACHED",
  );
  assert.equal(
    full.reduce((sum, upload) => sum + upload.bytes, 0),
    UPLOAD_WINDOW_BYTES,
  );
});

void test("uploads older than the window stop counting", () => {
  const old = Array.from({ length: 40 }, () =>
    checked(50_000_000, UPLOAD_WINDOW_MS + 1),
  );
  assert.equal(uploadRefusal(old, "video", 50_000_000, NOW), null);
});

void test("an upload of unknown size counts as its kind's limit until checked", () => {
  assert.equal(reservedBytes("image", 0), MAX_UPLOAD_BYTES.image);
  assert.equal(reservedBytes("image", 1234), 1234);
  const nearlyFull = [checked(UPLOAD_WINDOW_BYTES - 5_000_000)];
  assert.equal(uploadRefusal(nearlyFull, "image", 1_000, NOW), null);
  assert.equal(
    uploadRefusal(nearlyFull, "image", 0, NOW),
    "UPLOAD_LIMIT_REACHED",
  );
});

void test("too many uploads in flight at once are refused", () => {
  const pending = Array.from(
    { length: MAX_UNCHECKED_UPLOADS },
    (): UploadRecord => ({ bytes: 1_000, checked: false, createdAt: NOW }),
  );
  assert.equal(
    uploadRefusal(pending, "image", 1_000, NOW),
    "UPLOAD_LIMIT_REACHED",
  );
  assert.equal(uploadRefusal(pending.slice(1), "image", 1_000, NOW), null);
});

void test("an account that sent more than it said is stopped for the day", () => {
  const caught: UploadRecord = { ...checked(80_000_000), oversize: true };
  assert.equal(
    uploadRefusal([caught], "image", 1_000, NOW),
    "UPLOAD_LIMIT_REACHED",
  );
  assert.equal(
    uploadRefusal(
      [{ ...caught, createdAt: NOW - UPLOAD_WINDOW_MS - 1 }],
      "image",
      1_000,
      NOW,
    ),
    null,
  );
});

void test("a landed upload over its kind's limit is deleted", () => {
  assert.equal(uploadOversize("image", 10_000_000), false);
  assert.equal(uploadOversize("image", 10_000_001), true);
  assert.equal(uploadOversize("video", 50_000_001), true);
});

void test("only this PDS's own accounts upload", () => {
  assert.notEqual(
    localAccountId({ accountId: "sam@vera.chat" }, "vera.chat"),
    null,
  );
  assert.notEqual(
    localAccountId({ accountId: "Sam@Vera.Chat" }, "vera.chat"),
    null,
  );
  assert.equal(localAccountId(null, "vera.chat"), null);
  assert.equal(
    localAccountId({ accountId: "sam@other.example" }, "vera.chat"),
    null,
  );
  assert.equal(
    localAccountId({ accountId: "sam@vera.chat.other.example" }, "vera.chat"),
    null,
  );
  assert.equal(
    localAccountId(
      { accountId: "sam@vera.chat", federated: true },
      "vera.chat",
    ),
    null,
  );
  assert.equal(localAccountId({ accountId: "@vera.chat" }, "vera.chat"), null);
  assert.equal(localAccountId({ accountId: 42 }, "vera.chat"), null);
  assert.equal(localAccountId({}, "vera.chat"), null);
});

void test("ordinary types are stored as sent, lowercased", () => {
  assert.equal(uploadContentType("image/jpeg"), "image/jpeg");
  assert.equal(uploadContentType("Video/MP4"), "video/mp4");
  assert.equal(uploadContentType("text/html"), "text/html");
  assert.equal(
    uploadContentType(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
});

void test("lists, parameters and junk in a type become a plain download", () => {
  for (const type of [
    "image/png, text/html",
    "image/png;charset=utf-8",
    "text/html\r\nX-Other: 1",
    "",
    "image",
    "image/",
    "/png",
  ]) {
    assert.equal(uploadContentType(type), "application/octet-stream", type);
  }
});

void test("the stored extension comes from the name, or bin", () => {
  assert.equal(uploadExtension("Report.PDF"), "pdf");
  assert.equal(uploadExtension("page.html"), "html");
  assert.equal(uploadExtension("noextension"), "bin");
  assert.equal(uploadExtension("../../evil/.."), "bin");
  assert.equal(uploadExtension("a.b/c"), "bin");
});

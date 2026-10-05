import assert from "node:assert/strict";
import test from "node:test";

import { previewedUrl, withoutPreviewedUrl } from "./links.ts";

void test("previews the first link, without trailing punctuation", () => {
  assert.equal(
    previewedUrl("see https://a.com/x). and https://b.com"),
    "https://a.com/x",
  );
  assert.equal(previewedUrl("no links here"), undefined);
});

void test("cuts the previewed link out of the body", () => {
  const cases: [string, string][] = [
    ["https://vera.chat", ""],
    ["  https://vera.chat  ", ""],
    ["check this out https://vera.chat", "check this out"],
    ["https://vera.chat is neat", "is neat"],
    ["read https://vera.chat today", "read today"],
    ["see https://vera.chat.", "see."],
    ["is this it https://vera.chat?", "is this it?"],
    ["Look: https://vera.chat.", "Look:"],
    ["the site (https://vera.chat) is up", "the site is up"],
    ["first\nhttps://vera.chat\nsecond", "first\nsecond"],
    ["first\n\nhttps://vera.chat\n\nsecond", "first\n\nsecond"],
    ["https://a.com and https://b.com", "and https://b.com"],
    ["no links here", "no links here"],
  ];
  for (const [body, expected] of cases) {
    assert.equal(withoutPreviewedUrl(body), expected, body);
  }
});

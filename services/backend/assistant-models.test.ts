import assert from "node:assert/strict";
import { test } from "node:test";

import { GEMINI, GROK, modelOrder } from "./assistant-models.ts";

void test("Grok answers first, with Gemini behind it", () => {
  assert.deepEqual(modelOrder([]), [GROK, GEMINI]);
  assert.deepEqual(modelOrder(["image/jpeg", "image/png"]), [GROK, GEMINI]);
});

void test("a photo only Gemini can see puts Gemini first", () => {
  assert.deepEqual(modelOrder(["image/jpeg", "image/heic"]), [GEMINI, GROK]);
  assert.deepEqual(modelOrder(["image/GIF"]), [GEMINI, GROK]);
});

void test("a photo neither can see keeps Grok first", () => {
  assert.deepEqual(modelOrder(["image/tiff"]), [GROK, GEMINI]);
});

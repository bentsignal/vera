import assert from "node:assert/strict";
import { test } from "node:test";

import {
  configuredModels,
  HAIKU,
  KIMI,
  modelOrder,
} from "./assistant-models.ts";

void test("Haiku answers first, with Kimi behind it", () => {
  assert.deepEqual(modelOrder([]), [HAIKU, KIMI]);
  assert.deepEqual(modelOrder(["image/jpeg", "image/GIF"]), [HAIKU, KIMI]);
});

void test("a photo no model can see keeps the order", () => {
  assert.deepEqual(modelOrder(["image/tiff"]), [HAIKU, KIMI]);
});

void test("a model that sees every photo goes first", () => {
  const blind = { id: "x/blind", images: ["image/jpeg"] };
  assert.deepEqual(modelOrder(["image/gif"], [blind, KIMI]), [KIMI, blind]);
});

void test("ASSISTANT_MODELS picks the models and their order", () => {
  assert.deepEqual(configuredModels(undefined), [HAIKU, KIMI]);
  assert.deepEqual(configuredModels(" "), [HAIKU, KIMI]);
  assert.deepEqual(configuredModels("moonshotai/kimi-k3.1-pro"), [KIMI]);
  assert.deepEqual(
    configuredModels("openai/gpt-6-luna, moonshotai/kimi-k3.1-pro"),
    [{ id: "openai/gpt-6-luna", images: KIMI.images }, KIMI],
  );
});

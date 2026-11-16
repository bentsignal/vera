import assert from "node:assert/strict";
import { test } from "node:test";

import {
  configuredModels,
  HAIKU,
  KIMI,
  modelOrder,
} from "./assistant-models.ts";

void test("Kimi answers first, with Haiku behind it", () => {
  assert.deepEqual(modelOrder([]), [KIMI, HAIKU]);
  assert.deepEqual(modelOrder(["image/jpeg", "image/GIF"]), [KIMI, HAIKU]);
});

void test("a photo no model can see keeps the order", () => {
  assert.deepEqual(modelOrder(["image/tiff"]), [KIMI, HAIKU]);
});

void test("a model that sees every photo goes first", () => {
  const blind = { id: "x/blind", images: ["image/jpeg"] };
  assert.deepEqual(modelOrder(["image/gif"], [blind, HAIKU]), [HAIKU, blind]);
});

void test("ASSISTANT_MODELS picks the models and their order", () => {
  assert.deepEqual(configuredModels(undefined), [KIMI, HAIKU]);
  assert.deepEqual(configuredModels(" "), [KIMI, HAIKU]);
  assert.deepEqual(configuredModels("anthropic/claude-haiku-5.5"), [HAIKU]);
  assert.deepEqual(
    configuredModels("openai/gpt-6-luna, moonshotai/kimi-k3.1-pro"),
    [{ id: "openai/gpt-6-luna", images: KIMI.images }, KIMI],
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  configuredModels,
  HYDROGEN,
  modelOrder,
  SOL,
} from "./assistant-models.ts";

void test("Hydrogen answers first, with Sol behind it", () => {
  assert.deepEqual(modelOrder([]), [HYDROGEN, SOL]);
  assert.deepEqual(modelOrder(["image/jpeg", "image/GIF"]), [HYDROGEN, SOL]);
});

void test("a photo no model can see keeps the order", () => {
  assert.deepEqual(modelOrder(["image/tiff"]), [HYDROGEN, SOL]);
});

void test("a model that sees every photo goes first", () => {
  const blind = { id: "x/blind", images: ["image/jpeg"] };
  assert.deepEqual(modelOrder(["image/gif"], [blind, SOL]), [SOL, blind]);
});

void test("ASSISTANT_MODELS picks the models and their order", () => {
  assert.deepEqual(configuredModels(undefined), [HYDROGEN, SOL]);
  assert.deepEqual(configuredModels(" "), [HYDROGEN, SOL]);
  assert.deepEqual(configuredModels("openai/gpt-6.2-sol"), [SOL]);
  assert.deepEqual(configuredModels("openai/gpt-6-luna, openai/gpt-6.2-sol"), [
    { id: "openai/gpt-6-luna", images: SOL.images },
    SOL,
  ]);
});

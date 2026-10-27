import assert from "node:assert/strict";
import { test } from "node:test";

import { mentionsAssistant } from "./assistant-mentions.ts";

const VERA = { address: "vera@vera.chat", username: "vera" };

void test("a written @name mentions it, in any case", () => {
  assert.equal(mentionsAssistant(VERA, "@Vera what's this?", undefined), true);
  assert.equal(mentionsAssistant(VERA, "hey @vera, report it", undefined), true);
  assert.equal(mentionsAssistant(VERA, "thoughts @VERA?", undefined), true);
  assert.equal(mentionsAssistant(VERA, "(@Vera)", undefined), true);
});

void test("the app's mention of it mentions it", () => {
  assert.equal(
    mentionsAssistant(VERA, "@Vera Bot hi", [
      { accountId: "Vera@vera.chat", name: "Vera Bot" },
    ]),
    true,
  );
});

void test("its name alone, an address, or a longer word doesn't", () => {
  for (const body of [
    "Vera is great",
    "write to vera@vera.chat",
    "@veronica hi",
    "@vera_fan hi",
    "email@vera.chat",
  ]) {
    assert.equal(mentionsAssistant(VERA, body, undefined), false, body);
  }
  assert.equal(
    mentionsAssistant(VERA, "@Maya hi", [
      { accountId: "maya@vera.chat", name: "Maya" },
    ]),
    false,
  );
});

void test("someone else's mention that starts with its name doesn't", () => {
  const smith = [{ accountId: "vs@vera.chat", name: "Vera Smith" }];
  assert.equal(mentionsAssistant(VERA, "@Vera Smith lunch?", smith), false);
  assert.equal(
    mentionsAssistant(VERA, "@Vera Smith lunch? @Vera book it", smith),
    true,
  );
});

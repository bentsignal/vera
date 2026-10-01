import assert from "node:assert/strict";
import test from "node:test";

import { addressToTarget, parseAddress } from "./address.ts";

void test("parses an address into an optional federation target", () => {
  assert.deepEqual(parseAddress(" Alice@Chat.Example "), {
    domain: "chat.example",
    username: "alice",
  });
  assert.deepEqual(addressToTarget("alice@chat.example"), {
    id: "alice@chat.example",
    url: "https://chat.example",
  });
});

void test("rejects addresses with an invalid username", () => {
  assert.throws(() => parseAddress("not valid@chat.example"));
  assert.throws(() => parseAddress("@chat.example"));
});

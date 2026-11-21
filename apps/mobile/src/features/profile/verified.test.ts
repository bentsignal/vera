import assert from "node:assert/strict";
import test from "node:test";

import { verified } from "./verified.ts";

void test("the verified check shows only for Vera's own accounts", () => {
  assert.equal(verified("vera@vera.chat", true), true);
  assert.equal(verified("maya@vera.chat", false), false);
  // Whatever another server says of its accounts.
  assert.equal(verified("vera@liar.test", true), false);
  assert.equal(verified("vera@vera.chat.liar.test", true), false);
});

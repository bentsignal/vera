import assert from "node:assert/strict";
import { test } from "node:test";

import { glassAbove } from "./glass-hold.ts";

void test("the glass follows the React Native list's room down", () => {
  const sent = { lost: 44, roomCloses: true, wasRoom: 120 };
  assert.equal(glassAbove({ ...sent, room: 120 }), 44);
  assert.equal(glassAbove({ ...sent, room: 98 }), 22);
  assert.equal(glassAbove({ ...sent, room: 76 }), 0);
});

void test("with the native list the glass lets go as the field shrinks", () => {
  // Its room is never closed by the messages: it doesn't wait for it.
  assert.equal(
    glassAbove({ lost: 44, room: 120, roomCloses: false, wasRoom: 120 }),
    0,
  );
});

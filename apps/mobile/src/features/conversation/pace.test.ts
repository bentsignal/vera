import assert from "node:assert/strict";
import { test } from "node:test";

import type { Message } from "./types";
import { onlyOthersArrived, sameMessages } from "./pace.ts";

const ME = "me@vera.test";
const MAYA = "maya@vera.test";

function message(index: number, authorId = MAYA) {
  return {
    attachments: [],
    authorId,
    body: `Message ${String(index)}`,
    id: `m${String(index)}`,
    reactions: [],
    sentAt: new Date(index * 1000),
  } satisfies Message;
}

const shown = [message(1), message(2)];

void test("others' new messages can wait their turn", () => {
  assert.equal(
    onlyOthersArrived(shown, [...shown, message(3), message(4)], ME),
    true,
  );
});

void test("your own message, and any other change, shows at once", () => {
  // Yours.
  assert.equal(
    onlyOthersArrived(shown, [...shown, message(3), message(4, ME)], ME),
    false,
  );
  // An older page.
  assert.equal(onlyOthersArrived(shown, [message(0), ...shown], ME), false);
  // A reaction or edit (a message changed).
  assert.equal(
    onlyOthersArrived(
      shown,
      [message(1), { ...message(2), body: "edited" }, message(3)],
      ME,
    ),
    false,
  );
  // A deletion.
  assert.equal(onlyOthersArrived(shown, [message(1)], ME), false);
});

void test("the same messages in a new list are the same", () => {
  assert.equal(sameMessages(shown, [...shown]), true);
  assert.equal(sameMessages(shown, [message(1)]), false);
});

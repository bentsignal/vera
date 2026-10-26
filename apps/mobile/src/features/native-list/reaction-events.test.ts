import assert from "node:assert/strict";
import { test } from "node:test";

import { reactionKey } from "./map-blocks.ts";
import { message, photo } from "./map-rows.testing.ts";
import { reactionAction, reactionMenuPlace } from "./reaction-events.ts";

const FRAME = { height: 200, width: 240, x: 20, y: 300 };

function press(key?: string, frame?: typeof FRAME) {
  return {
    element: "reaction" as const,
    frame,
    reactionKey: key,
    rowId: "m1",
    type: "press" as const,
  };
}

function hold(key?: string) {
  return {
    element: key === undefined ? undefined : ("reaction" as const),
    frame: FRAME,
    reactionKey: key,
    rowId: "m1",
    type: "hold" as const,
  };
}

void test("a stacked chip toggles when tapped and shows who reacted when held", () => {
  const key = reactionKey("2", "❤️");
  assert.deepEqual(reactionAction(press(key, FRAME), "stacked"), {
    emoji: "❤️",
    kind: "toggle",
    part: 2,
  });
  assert.deepEqual(reactionAction(hold(key), "stacked"), {
    emoji: "❤️",
    kind: "sheet",
    part: 2,
  });
});

void test("a bubble's tapbacks show who reacted over their part", () => {
  const key = reactionKey("message", "👍");
  const menu = { emoji: "👍", frame: FRAME, kind: "menu", part: "message" };
  assert.deepEqual(reactionAction(press(key, FRAME), "bubbles"), menu);
  assert.deepEqual(reactionAction(hold(key), "bubbles"), menu);
});

void test("a tapback tap from a binary that sends no frame opens the sheet", () => {
  assert.deepEqual(
    reactionAction(press(reactionKey("link-0", "😂")), "bubbles"),
    { emoji: "😂", kind: "sheet", part: "link-0" },
  );
});

void test("a hold on a message, not a reaction, isn't one", () => {
  assert.equal(reactionAction(hold(), "stacked"), null);
  assert.equal(
    reactionAction({ ...press(), element: "message" }, "bubbles"),
    null,
  );
  assert.equal(reactionAction(press(), "stacked"), null);
});

void test("the reactions menu opens on the reaction's own part", () => {
  const captioned = message("m1", 0, {
    attachments: [
      photo("a.jpg"),
      photo("b.jpg"),
      { ...photo("c.pdf"), kind: "file" },
    ],
    body: "trip",
  });
  // A photo's tapback: native reports the photo, by part and index.
  const onPhoto = { frame: FRAME, index: 1, part: "1", rowId: "m1" };
  assert.deepEqual(reactionMenuPlace(captioned, 1, onPhoto), onPhoto);
  // A file's: its part.
  const onFile = { frame: FRAME, part: "2", rowId: "m1" };
  assert.deepEqual(reactionMenuPlace(captioned, 2, onFile), onFile);
  // Reported over the text for a reaction on a photo: the photo.
  assert.deepEqual(
    reactionMenuPlace(captioned, 0, {
      frame: FRAME,
      part: "message",
      rowId: "m1",
    }),
    { frame: FRAME, part: "0", rowId: "m1" },
  );
  // A link card's reaction reported with a media index: the card.
  assert.deepEqual(reactionMenuPlace(captioned, "link-0", { ...onPhoto }), {
    frame: FRAME,
    part: "link-0",
    rowId: "m1",
  });
});

void test("without text, the first photo is the message's own part", () => {
  const photos = message("m2", 0, {
    attachments: [photo("a.jpg"), photo("b.jpg")],
    body: undefined,
  });
  const onFirst = { frame: FRAME, index: 0, part: "message", rowId: "m2" };
  assert.deepEqual(reactionMenuPlace(photos, "message", onFirst), onFirst);
});

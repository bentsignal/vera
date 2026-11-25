import assert from "node:assert/strict";
import { test } from "node:test";

import type { WatchedSpace } from "./removal.ts";
import {
  isScreenInSpace,
  leftOnPurpose,
  lostSpaces,
  markLeaving,
} from "./removal.ts";

const ME = "me@vera.chat";
const OTHER = "other@vera.chat";

const club = {
  account: ME,
  channels: [
    { conversationId: "channel:general" },
    { conversationId: "channel:books" },
  ],
  name: "Book Club",
  spaceId: "space:club",
} satisfies WatchedSpace;

const art = {
  account: ME,
  channels: [{ conversationId: "channel:art" }],
  name: "Art",
  spaceId: "space:art",
} satisfies WatchedSpace;

void test("a space an account answered without is lost", () => {
  const lost = lostSpaces(new Map([[ME, [club, art]]]), new Map([[ME, [art]]]));
  assert.deepEqual(lost, [club]);
});

void test("an account that hasn't answered loses nothing", () => {
  // Not answered yet after: not compared. Not answered before: nothing to lose.
  assert.deepEqual(lostSpaces(new Map([[ME, [club]]]), new Map()), []);
  assert.deepEqual(lostSpaces(new Map(), new Map([[ME, []]])), []);
});

void test("the space's own screen, channels, and threads are inside it", () => {
  assert.equal(isScreenInSpace({ spaceId: "space:club" }, club), true);
  assert.equal(
    isScreenInSpace({ conversationId: "channel:books" }, club),
    true,
  );
  // A thread carries its channel's conversationId.
  assert.equal(
    isScreenInSpace(
      { conversationId: "channel:general", threadId: "thread:1" },
      club,
    ),
    true,
  );
});

void test("screens elsewhere, or as another account, aren't", () => {
  assert.equal(isScreenInSpace({}, club), false);
  assert.equal(isScreenInSpace({ conversationId: "channel:art" }, club), false);
  assert.equal(isScreenInSpace({ spaceId: "space:art" }, club), false);
  assert.equal(
    isScreenInSpace({ account: OTHER, spaceId: "space:club" }, club),
    false,
  );
  assert.equal(
    isScreenInSpace({ account: ME, spaceId: "space:club" }, club),
    true,
  );
});

void test("leaving on purpose is remembered once", () => {
  assert.equal(leftOnPurpose(ME, "space:club"), false);
  markLeaving(ME, "space:club");
  assert.equal(leftOnPurpose(OTHER, "space:club"), false);
  assert.equal(leftOnPurpose(ME, "space:club"), true);
  assert.equal(leftOnPurpose(ME, "space:club"), false);
});

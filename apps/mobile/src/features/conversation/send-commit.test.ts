import assert from "node:assert/strict";
import { test } from "node:test";

import { clearIsCommitted, createSendCommit } from "./send-commit.ts";

void test("a sequence increment alone cannot acknowledge old text or files", () => {
  const send = createSendCommit();
  const id = send.begin(5, ["photo"]);
  assert.equal(clearIsCommitted(send.read(), 5, []), false);
  send.expect(id, "own-row");
  assert.equal(clearIsCommitted(send.read(), 4, []), false);
  assert.equal(clearIsCommitted(send.read(), 5, ["photo"]), false);
  assert.equal(clearIsCommitted(send.read(), 5, []), true);
});

void test("same-height sends acknowledge without a height callback", () => {
  const send = createSendCommit();
  const id = send.begin(1, []);
  send.expect(id, "own-row");
  assert.equal(clearIsCommitted(send.read(), 1, []), true);
  send.acknowledge(id, 76);
  assert.equal(send.read().height, 76);
  assert.equal(clearIsCommitted(send.read(), 1, []), false);
});

void test("new typing and newly staged IDs do not strand the cleared send", () => {
  const send = createSendCommit();
  const id = send.begin(2, ["sent-photo"]);
  send.expect(id, "own-row");
  assert.equal(clearIsCommitted(send.read(), 2, ["next-photo"]), true);
  assert.equal(clearIsCommitted(send.read(), 3, []), true);
});

void test("rapid supersession rejects old row IDs, ACKs and cancellation", () => {
  const send = createSendCommit();
  const first = send.begin(1, []);
  const second = send.begin(2, []);
  send.expect(first, "old");
  send.acknowledge(first, 76);
  send.cancel(first);
  assert.equal(send.read().sequence, second);
  assert.equal(send.read().height, undefined);
  assert.equal(send.read().messageId, undefined);
  assert.equal(send.read().cancelled, false);
  send.expect(second, "new");
  send.acknowledge(second, 84);
  assert.equal(send.read().height, 84);
});

void test("submission exceptions cancel without waiting for a nonexistent row", () => {
  const send = createSendCommit();
  const id = send.begin(1, ["preserved-file"]);
  send.cancel(id);
  assert.equal(clearIsCommitted(send.read(), 0, ["preserved-file"]), true);
  send.acknowledge(id, 148);
  assert.equal(send.read().cancelled, true);
  assert.equal(send.read().height, 148);
});

void test("invalid measurement is surfaced, never converted to a timed release", () => {
  const send = createSendCommit();
  const id = send.begin(1, []);
  for (const height of [0, -1, NaN, Infinity]) {
    assert.throws(() => send.acknowledge(id, height), /valid bar height/);
    assert.equal(send.read().height, undefined);
  }
});

void test("observers unsubscribe and a remount starts with independent identity", () => {
  const first = createSendCommit();
  let events = 0;
  const unsubscribe = first.subscribe(() => events++);
  first.begin(1, []);
  unsubscribe();
  first.expect(1, "old-instance");
  assert.equal(events, 1);
  const second = createSendCommit();
  assert.equal(second.read().sequence, 0);
  assert.equal(second.read().messageId, undefined);
});

void test("navigation waits for arming and a superseding send rejects old completion", () => {
  const send = createSendCommit();
  assert.equal(send.requestLatest(), false);
  const first = send.begin(1, []);
  assert.equal(send.requestLatest(), true);
  assert.equal(send.read().latestArmed, undefined);
  const second = send.begin(2, []);
  send.armLatest(first);
  assert.equal(send.read().latestArmed, undefined);
  send.requestLatest();
  send.armLatest(second);
  assert.equal(send.read().latestArmed, true);
});

void test("freeze before publication invalidates arming; thaw refreshes height", () => {
  const send = createSendCommit();
  const id = send.begin(1, []);
  send.requestLatest();
  send.armLatest(id);
  send.acknowledge(id, 76);
  send.observeLayout(104, true);
  assert.equal(send.read().latestArmed, false);
  assert.equal(send.read().layout?.frozen, true);
  send.observeLayout(104, false);
  assert.equal(send.read().layout?.height, 104);
  assert.equal(send.read().height, 76);
  send.armLatest(id);
  send.published(id);
  assert.equal(send.requestLatest(), false);
});

void test("pre-arm cancellation suppresses command; post-arm cancel retains generic navigation", () => {
  const send = createSendCommit();
  const first = send.begin(1, []);
  send.cancel(first);
  assert.equal(send.requestLatest(), false);
  const second = send.begin(2, []);
  send.requestLatest();
  send.armLatest(second);
  send.cancel(second);
  assert.equal(send.read().latestArmed, true);
});

void test("failed native invocation removes navigation gate without erasing ACK", () => {
  const send = createSendCommit();
  const id = send.begin(1, []);
  send.expect(id, "own-row");
  send.acknowledge(id, 76);
  send.requestLatest();
  send.failLatest(id);
  assert.equal(send.read().latestRequested, false);
  assert.equal(send.read().height, 76);
  assert.equal(send.read().messageId, "own-row");
});

void test("a lift interruption clears only pending navigation and thaw cannot revive it", () => {
  const send = createSendCommit();
  const id = send.begin(1, []);
  send.expect(id, "own-row");
  send.acknowledge(id, 76);
  send.requestLatest();
  send.armLatest(id);
  send.interruptLatest();
  send.observeLayout(104, true);
  send.observeLayout(104, false);
  assert.equal(send.read().latestRequested, false);
  assert.equal(send.read().latestArmed, false);
  assert.equal(send.read().cancelled, false);
  assert.equal(send.read().height, 76);
  assert.equal(send.read().messageId, "own-row");
});

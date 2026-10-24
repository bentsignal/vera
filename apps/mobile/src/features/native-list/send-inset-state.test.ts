import assert from "node:assert/strict";
import { test } from "node:test";

import type { Newest } from "../conversation/typing-change.ts";
import type { InsetState } from "./send-inset-state.ts";
import {
  heldMessages,
  holdsForSend,
  rendered,
  waited,
  withHeight,
} from "./send-inset-state.ts";
import { holdTypists } from "./typing-hold.ts";

// A five-line send: the composer goes from 162 to 76 tall. Native has "m1"
// as its newest message; the message sent is "m2". Sending empties the
// field in the same render that brings "m2" (the draft and the outbox
// update together), and the new height is measured only after that.
function m(id: string, authorId = "me") {
  return { authorId, id };
}
const AT_REST = {
  height: 162,
  newest: "m1",
  pending: undefined,
  sends: 0,
} satisfies InsetState;
function ids(state: InsetState, messages: { id: string }[]) {
  return heldMessages(state, messages).map((message) => message.id);
}
/** The render the send's message arrives in, with send 1. */
function sending() {
  return rendered(AT_REST, { newest: "m2", sends: 1 });
}

void test("the send's render keeps the message sent and the old height", () => {
  const state = sending();
  assert.deepEqual(ids(state, [m("m0"), m("m1"), m("m2")]), ["m0", "m1"]);
  assert.equal(state.height, 162);
});

void test("the measured height lets the message go with it, in one update", () => {
  const state = withHeight(sending(), 76, false);
  assert.deepEqual(ids(state, [m("m1"), m("m2")]), ["m1", "m2"]);
  assert.equal(state.height, 76);
});

void test("onHeight first or onSentShorter first lets go the same way", () => {
  // Both report through the composer's `live` height: whichever is first
  // lets go, and the other, the same height, changes nothing.
  const released = withHeight(sending(), 76, false);
  assert.equal(withHeight(released, 76, false), released);
});

void test("a late height still goes with the message, however late", () => {
  // No timer lets go before the height is known while one is coming: many
  // renders later, the message still waits.
  let state = sending();
  for (const newest of ["m2", "m2", "m2"]) {
    state = rendered(state, { newest, sends: 1 });
  }
  assert.deepEqual(ids(state, [m("m1"), m("m2")]), ["m1"]);
  state = withHeight(state, 76, false);
  assert.deepEqual(ids(state, [m("m1"), m("m2")]), ["m1", "m2"]);
  assert.equal(state.height, 76);
});

void test("a one-line send waits for nothing", () => {
  assert.equal(holdsForSend({ editing: false, field: 40, least: 40 }), false);
  assert.equal(holdsForSend({ editing: false, field: 40.3, least: 40 }), false);
  // No send counted: the message goes in the render that brings it.
  const state = rendered(AT_REST, { newest: "m2", sends: 0 });
  assert.deepEqual(ids(state, [m("m1"), m("m2")]), ["m1", "m2"]);
  assert.equal(state.height, 162);
});

void test("a taller field waits, and an edit never does", () => {
  assert.equal(holdsForSend({ editing: false, field: 128, least: 40 }), true);
  assert.equal(holdsForSend({ editing: true, field: 128, least: 40 }), false);
});

void test("someone else's message while waiting waits too, and goes with the height", () => {
  let state = sending();
  state = rendered(state, { newest: "t1", sends: 1 });
  const all = [m("m1"), m("m2"), m("t1", "maya")];
  assert.deepEqual(ids(state, all), ["m1"]);
  state = withHeight(state, 76, false);
  assert.deepEqual(ids(state, all), ["m1", "m2", "t1"]);
});

void test("a typist whose message arrives while waiting stays until it goes in", () => {
  // Maya was typing and has stopped; her message comes in during the wait.
  // The typing row is worked out from the messages native gets, so she
  // stays in it until her message is let go, then leaves in that same
  // update: native grows her message out of her typing bubble.
  function recent(state: InsetState, messages: ReturnType<typeof m>[]) {
    return [...heldMessages(state, messages)]
      .reverse()
      .map(({ authorId, id }) => ({ authorId, key: id })) satisfies Newest[];
  }
  const all = [m("m1"), m("m2"), m("t1", "maya")];
  const typing = { leaving: [], newestKey: "m1", shown: ["maya"] };

  let state = rendered(sending(), { newest: "t1", sends: 1 });
  const waiting = holdTypists(typing, [], recent(state, all));
  assert.deepEqual(waiting.shown, ["maya"]);
  assert.deepEqual(waiting.leaving, ["maya"]);

  state = withHeight(state, 76, false);
  const released = holdTypists(waiting, [], recent(state, all));
  assert.deepEqual(released.shown, []);
  assert.deepEqual(ids(state, all), ["m1", "m2", "t1"]);
});

void test("attachments closing in steps: the messages go with their last height", () => {
  let state = sending();
  state = withHeight(state, 120, true);
  state = withHeight(state, 90, true);
  assert.deepEqual(ids(state, [m("m1"), m("m2")]), ["m1"]);
  assert.equal(state.height, 162);
  // Done closing: the UI thread has the last step's height.
  state = waited(state, 1, 90);
  assert.deepEqual(ids(state, [m("m1"), m("m2")]), ["m1", "m2"]);
  assert.equal(state.height, 90);
  // The last step's report afterwards, the same height: nothing new.
  assert.equal(withHeight(state, 90, false), state);
});

// The guard's boundary. Updates to native are compared as (messages,
// inset) pairs: one pair changing both is one move; the inset changing
// alone after the messages went is the up-then-down.

void test("boundary: a height reported just before the guard is one update", () => {
  const state = withHeight(sending(), 76, false);
  assert.deepEqual(ids(state, [m("m1"), m("m2")]), ["m1", "m2"]);
  assert.equal(state.height, 76);
  // The guard then finds nothing waiting.
  assert.equal(waited(state, 1, 76), state);
});

void test("boundary: the guard after the UI thread saw the shrink, its report still queued, is one update", () => {
  // JavaScript was late, the UI thread wasn't: the guard goes with the
  // height on the UI thread, and the late report changes nothing.
  const state = waited(sending(), 1, 76);
  assert.deepEqual(ids(state, [m("m1"), m("m2")]), ["m1", "m2"]);
  assert.equal(state.height, 76);
  const late = withHeight(state, 76, false);
  assert.equal(late, state);
});

void test("boundary, known limit: the guard before the composer got shorter at all is two updates", () => {
  // Not one move, and not what agreed A allows: the messages go with the
  // old height, then the new height goes alone, up then down. Only when
  // the composer's own shrink is later than the guard even on the UI
  // thread. Kept here so a change that widens it shows.
  let state = waited(sending(), 1, 162);
  assert.deepEqual(ids(state, [m("m1"), m("m2")]), ["m1", "m2"]);
  assert.equal(state.height, 162);
  state = withHeight(state, 76, false);
  assert.equal(state.height, 76);
});

void test("the guard with no shrink coming lets the message go, nothing after", () => {
  // The field didn't get shorter after all: the message goes, and no
  // height follows.
  const state = waited(sending(), 1, 162);
  assert.deepEqual(ids(state, [m("m1"), m("m2")]), ["m1", "m2"]);
  assert.equal(state.height, 162);
});

void test("an earlier send's guard doesn't end a later send's wait", () => {
  let state = withHeight(sending(), 76, false);
  state = rendered(state, { newest: "m2", sends: 1 });
  state = rendered(state, { newest: "m3", sends: 2 });
  assert.equal(waited(state, 1, 76), state);
  assert.deepEqual(ids(state, [m("m2"), m("m3")]), ["m2"]);
});

void test("if the message it waits under is gone, every message goes", () => {
  const state = sending();
  assert.deepEqual(ids(state, [m("x1"), m("x2")]), ["x1", "x2"]);
});

void test("a send into an empty conversation waits with no messages", () => {
  const empty = { ...AT_REST, newest: undefined };
  const state = rendered(empty, { newest: "m1", sends: 1 });
  assert.deepEqual(ids(state, [m("m1")]), []);
});

void test("a render with nothing new keeps the same state", () => {
  assert.equal(rendered(AT_REST, { newest: "m1", sends: 0 }), AT_REST);
  const state = sending();
  assert.equal(rendered(state, { newest: "m2", sends: 1 }), state);
  assert.equal(withHeight(AT_REST, 162.2, false), AT_REST);
});

void test("other height changes go at once", () => {
  const state = withHeight(AT_REST, 184, false);
  assert.equal(state.height, 184);
  assert.equal(state.pending, undefined);
});

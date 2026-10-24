import assert from "node:assert/strict";
import { test } from "node:test";

import type { SendCommit } from "../conversation/send-commit.ts";
import type { InsetState } from "./send-inset-state.ts";
import {
  acknowledged,
  heldMessages,
  initialInset,
  insetFor,
  rendered,
  withHeight,
} from "./send-inset-state.ts";

const REST = {
  height: 162,
  visible: ["old0", "old1"],
  sends: 0,
  released: 0,
  pending: undefined,
} satisfies InsetState;
const ACK = {
  sequence: 1,
  clear: 1,
  files: [],
  messageId: "mine",
  height: 76,
  cancelled: false,
} satisfies SendCommit;
const ROWS = ["old0", "old1", "mine"];
function sending() {
  return rendered(REST, { sends: 1, ids: ROWS });
}
function pair(
  state: InsetState,
  send: SendCommit = ACK,
  ids = ROWS,
  options: { frozen?: boolean; height?: number } = {},
) {
  return acknowledged(state, {
    send,
    ids,
    frozen: options.frozen ?? false,
    height: options.height ?? 76,
  });
}
function visible(state: InsetState, ids = ROWS) {
  return heldMessages(
    state,
    ids.map((id) => ({ id })),
  ).map((m) => m.id);
}

void test("the submit render holds rows and old inset before the ACK", () => {
  const state = sending();
  assert.equal(state.height, 162);
  assert.deepEqual(visible(state), ["old0", "old1"]);
});

void test("generic height reports never release a pending send", () => {
  const state = sending();
  for (const height of [76, 162, 84, 230])
    assert.equal(withHeight(state, height), state);
  assert.equal(pair(state, { ...ACK, height: undefined }), state);
});

void test("delayed actual layout beyond the old deadline still releases only one pair", () => {
  let state = sending();
  const observed = [[visible(state), state.height]];
  for (let frame = 0; frame < 180; frame++) {
    state = rendered(state, { sends: 1, ids: ROWS });
    state = withHeight(state, 162);
  }
  assert.equal(state.height, 162);
  state = pair(state);
  observed.push([visible(state), state.height]);
  assert.deepEqual(observed, [
    [["old0", "old1"], 162],
    [ROWS, 76],
  ]);
});

void test("ACK before exact own row holds even if another person arrives", () => {
  const state = sending();
  const other = ["old0", "old1", "someone-else"];
  assert.equal(pair(state, ACK, other), state);
  const all = [...other, "mine"];
  const released = pair(state, ACK, all);
  assert.deepEqual(visible(released, all), all);
  assert.equal(released.height, 76);
});

void test("same-height send releases without a height callback", () => {
  const state = { ...sending(), height: 76 };
  assert.equal(pair(state).pending, undefined);
  assert.equal(pair(state).height, 76);
});

void test("rapid supersession keeps the original held boundary and rejects old ACK", () => {
  const state = rendered(sending(), { sends: 2, ids: [...ROWS, "mine2"] });
  assert.deepEqual(visible(state, [...ROWS, "mine2"]), ["old0", "old1"]);
  assert.equal(pair(state), state);
  const released = pair(state, { ...ACK, sequence: 2, messageId: "mine2" }, [
    ...ROWS,
    "mine2",
  ]);
  assert.equal(released.pending, undefined);
  assert.deepEqual(released.visible, [...ROWS, "mine2"]);
});

void test("freeze keeps both rows and height, thaw uses fresh committed geometry", () => {
  const state = sending();
  assert.equal(pair(state, ACK, ROWS, { frozen: true }), state);
  assert.equal(withHeight(state, 104), state);
  const thawed = pair(state, ACK, ROWS, { height: 104 });
  assert.equal(thawed.height, 104);
  assert.equal(thawed.pending, undefined);
});

void test("cancelled submission waits for geometry but no nonexistent row", () => {
  const state = sending();
  const cancelled = { ...ACK, messageId: undefined, cancelled: true };
  assert.equal(
    pair(state, { ...cancelled, height: undefined }, REST.visible),
    state,
  );
  const released = pair(state, cancelled, REST.visible);
  assert.equal(released.pending, undefined);
  assert.deepEqual(released.visible, REST.visible);
});

void test("deleting the old boundary does not expose held concurrent arrivals", () => {
  const state = sending();
  assert.deepEqual(visible(state, ["old0", "other", "mine"]), ["old0"]);
  assert.deepEqual(
    visible(pair(state, ACK, ["old0", "other", "mine"]), [
      "old0",
      "other",
      "mine",
    ]),
    ["old0", "other", "mine"],
  );
});

void test("a send into an empty chat holds no old rows", () => {
  const state = rendered({ ...REST, visible: [] }, { sends: 1, ids: ["mine"] });
  assert.deepEqual(visible(state, ["mine"]), []);
  assert.deepEqual(pair(state, ACK, ["mine"]).visible, ["mine"]);
});

void test("stable renders, duplicate heights and stale sequences do not restart state", () => {
  assert.equal(rendered(REST, { sends: 0, ids: REST.visible }), REST);
  assert.equal(withHeight(REST, 162.2), REST);
  const released = pair(sending());
  assert.equal(rendered(released, { sends: 0, ids: ROWS }), released);
  assert.equal(pair(released), released);
});

void test("an invalid release measurement is an error, not an old-height fallback", () => {
  assert.throws(
    () => pair(sending(), ACK, ROWS, { height: NaN }),
    /committed composer geometry/,
  );
});

void test("non-send edits, pagination and ordinary composer growth stay live", () => {
  assert.equal(withHeight(REST, 184).height, 184);
  const paged = rendered(REST, { sends: 0, ids: ["older", ...REST.visible] });
  assert.equal(paged.pending, undefined);
  assert.deepEqual(paged.visible, ["older", ...REST.visible]);
});

void test("ready own row and height remain held until generic command is armed", () => {
  const requested = { ...ACK, latestRequested: true };
  const state = sending();
  assert.equal(pair(state, requested), state);
  assert.equal(
    pair(state, { ...requested, latestArmed: true }).pending,
    undefined,
  );
  assert.equal(
    pair(state, { ...requested, cancelled: true }).pending,
    undefined,
  );
});

void test("same-store remount after ACK still waits for exact row and navigation", () => {
  const send = {
    ...ACK,
    layout: { height: 76, frozen: false },
    latestRequested: true,
  };
  const mounted = initialInset(send, ROWS, 162);
  assert.notEqual(mounted.pending, undefined);
  assert.equal(insetFor(mounted, send, ROWS, false), mounted);
  assert.equal(
    insetFor(mounted, { ...send, latestArmed: true }, REST.visible, false),
    mounted,
  );
  assert.equal(
    insetFor(mounted, { ...send, latestArmed: true }, ROWS, true),
    mounted,
  );
  const released = insetFor(
    mounted,
    { ...send, latestArmed: true },
    ROWS,
    false,
  );
  assert.equal(released.pending, undefined);
  assert.equal(released.height, 76);
  assert.deepEqual(released.visible, ROWS);
});

void test("a published store remount starts from current rows without rearming", () => {
  const state = initialInset({ ...ACK, published: true }, ROWS, 76);
  assert.equal(state.pending, undefined);
  assert.deepEqual(state.visible, ROWS);
});

void test("release authority persists through ordinary geometry and a newer held send", () => {
  const first = pair(sending());
  assert.equal(first.released, 1);
  const typed = withHeight(first, 120);
  assert.equal(typed.released, 1);
  const second = rendered(typed, { sends: 2, ids: [...ROWS, "mine2"] });
  assert.equal(second.released, 1);
  assert.equal(withHeight(second, 76).released, 1);
  assert.equal(pair(second), second);
  const next = pair(second, { ...ACK, sequence: 2, messageId: "mine2" }, [
    ...ROWS,
    "mine2",
  ]);
  assert.equal(next.released, 2);
  assert.equal(next.pending, undefined);
});

void test("unchanged-row cancellation still publishes a new explicit release", () => {
  const pending = rendered(REST, { sends: 1, ids: REST.visible });
  const cancelled = { ...ACK, cancelled: true, messageId: undefined };
  const released = pair(pending, cancelled, REST.visible, {
    height: REST.height,
  });
  assert.deepEqual(released.visible, REST.visible);
  assert.equal(released.height, REST.height);
  assert.equal(released.released, 1);
});

void test("a remount replays published authority but never authorizes an unpublished ACK", () => {
  const send = { ...ACK, sequence: 7, published: true };
  const replay = initialInset(send, ROWS, 76);
  assert.equal(replay.released, 7);
  assert.equal(replay.pending, undefined);
  const waiting = initialInset({ ...send, published: false }, ROWS, 76);
  assert.equal(waiting.released, 0);
  assert.equal(waiting.pending?.sends, 7);
  assert.equal(withHeight(waiting, 120).released, 0);
});

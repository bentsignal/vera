import assert from "node:assert/strict";
import { test } from "node:test";

import type { RestartState } from "./restart-policy.ts";
import {
  canRestartForUpdate,
  OPEN_WINDOW_MS,
  QUIET_MS,
} from "./restart-policy.ts";

const OPENED = {
  active: true,
  keyboardVisible: false,
  now: 10_000,
  openedAt: 9_000,
  pendingMutations: 0,
  touchedAt: 9_500,
  unsentMessages: false,
  viewingMedia: false,
} satisfies RestartState;

/** In use: past the opening, and touched just now. */
const IN_USE = {
  ...OPENED,
  now: OPENED.openedAt + 60_000,
  touchedAt: OPENED.openedAt + 59_000,
};

void test("an update ready while the app opens restarts it", () => {
  assert.equal(canRestartForUpdate(OPENED), true);
  assert.equal(
    canRestartForUpdate({ ...OPENED, now: OPENED.openedAt + OPEN_WINDOW_MS }),
    true,
  );
});

void test("an app in use restarts only after a pause", () => {
  assert.equal(canRestartForUpdate(IN_USE), false);
  assert.equal(
    canRestartForUpdate({ ...IN_USE, now: IN_USE.touchedAt + QUIET_MS }),
    true,
  );
});

void test("someone typing or watching is never restarted after the opening", () => {
  assert.equal(
    canRestartForUpdate({
      ...IN_USE,
      keyboardVisible: true,
      now: IN_USE.touchedAt + QUIET_MS * 10,
    }),
    false,
  );
  assert.equal(
    canRestartForUpdate({
      ...IN_USE,
      now: IN_USE.touchedAt + QUIET_MS * 10,
      viewingMedia: true,
    }),
    false,
  );
});

void test("nothing in flight is lost to a restart", () => {
  assert.equal(canRestartForUpdate({ ...OPENED, unsentMessages: true }), false);
  assert.equal(canRestartForUpdate({ ...OPENED, pendingMutations: 1 }), false);
});

void test("an app back in the background isn't restarted", () => {
  assert.equal(canRestartForUpdate({ ...OPENED, active: false }), false);
});

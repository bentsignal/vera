import assert from "node:assert/strict";
import { test } from "node:test";

import type { LaunchGateState } from "./launch-gate.ts";
import {
  BLANK_FOR_MS,
  canContinue,
  CONTINUE_AFTER_MS,
  COVER_AT_LEAST_MS,
  GIVE_UP_MS,
  launchStep,
  STALL_MS,
} from "./launch-gate.ts";

/** Just launched, the check under way. */
const LAUNCHED = {
  coverShownAt: undefined,
  heardAt: 0,
  now: 100,
  running: true,
  startedAt: 0,
  updateReady: false,
} satisfies LaunchGateState;

/** "Updating Vera…" showing, the download still going. */
const COVERED = {
  ...LAUNCHED,
  coverShownAt: BLANK_FOR_MS,
  heardAt: BLANK_FOR_MS + 500,
  now: BLANK_FOR_MS + 600,
};

void test("a quick check or download stays on the blank splash", () => {
  assert.equal(launchStep(LAUNCHED), "blank");
  assert.equal(launchStep({ ...LAUNCHED, running: false }), "open");
  assert.equal(launchStep({ ...LAUNCHED, updateReady: true }), "restart");
});

void test("a slow one shows Updating Vera after the blank splash", () => {
  assert.equal(
    launchStep({ ...LAUNCHED, heardAt: 1_000, now: BLANK_FOR_MS }),
    "cover",
  );
});

void test("Updating Vera stays up for its minimum before going away", () => {
  const early = { ...COVERED, now: BLANK_FOR_MS + COVER_AT_LEAST_MS - 1 };
  assert.equal(launchStep({ ...early, updateReady: true }), "cover");
  assert.equal(launchStep({ ...early, running: false }), "cover");
  const later = { ...COVERED, now: BLANK_FOR_MS + COVER_AT_LEAST_MS };
  assert.equal(launchStep({ ...later, updateReady: true }), "restart");
  assert.equal(launchStep({ ...later, running: false }), "open");
});

void test("a download still making progress keeps waiting", () => {
  assert.equal(
    launchStep({ ...COVERED, heardAt: 40_000, now: 45_000 }),
    "cover",
  );
});

void test("a stalled check or download opens the app", () => {
  assert.equal(
    launchStep({ ...COVERED, heardAt: 20_000, now: 20_000 + STALL_MS }),
    "open",
  );
  assert.equal(
    launchStep({ ...LAUNCHED, heardAt: 0, now: STALL_MS, coverShownAt: 1 }),
    "open",
  );
});

void test("nothing holds the app past the limit", () => {
  const limit = { ...COVERED, heardAt: GIVE_UP_MS, now: GIVE_UP_MS };
  assert.equal(launchStep(limit), "open");
  assert.equal(launchStep({ ...limit, updateReady: true }), "open");
  assert.equal(launchStep({ ...limit, coverShownAt: GIVE_UP_MS - 1 }), "open");
});

void test("continuing without the update is offered after a while", () => {
  assert.equal(
    canContinue({ now: CONTINUE_AFTER_MS - 1, startedAt: 0 }),
    false,
  );
  assert.equal(canContinue({ now: CONTINUE_AFTER_MS, startedAt: 0 }), true);
});

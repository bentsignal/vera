import assert from "node:assert/strict";
import { test } from "node:test";

import {
  lastSentByAuthor,
  shownTypists,
  typingFaces,
  typingLabel,
} from "./typing-state.ts";

const MAYA = "maya@vera.chat";
const LEO = "leo@vera.chat";
const NOBODY_SENT = new Map<string, number>();

function typist(accountId: string, typedAt: number, expiresIn = 6000) {
  return { accountId, expiresIn, startedAt: typedAt, typedAt };
}

void test("a typist shows until their time runs out, by this clock", () => {
  // The PDS's clock is far from this device's: only `expiresIn` counts.
  const typists = [typist(MAYA, 5_000_000, 4000)];
  function at(now: number) {
    return shownTypists({
      arrivedAt: 1000,
      lastSentAt: NOBODY_SENT,
      now,
      scope: "a",
      typists,
    });
  }
  assert.deepEqual(at(1000), { accountIds: [MAYA], nextChange: 5000 });
  assert.deepEqual(at(4999).accountIds, [MAYA]);
  assert.deepEqual(at(5000), { accountIds: [], nextChange: undefined });
});

void test("a typist's time counts from when it first arrived", () => {
  const typists = [typist(MAYA, 100)];
  const first = shownTypists({
    arrivedAt: 1000,
    lastSentAt: NOBODY_SENT,
    now: 1000,
    scope: "b",
    typists,
  });
  // The same answer again later (a screen opened again) keeps its time.
  const again = shownTypists({
    arrivedAt: 6000,
    lastSentAt: NOBODY_SENT,
    now: 6500,
    scope: "b",
    typists,
  });
  assert.equal(first.nextChange, 7000);
  assert.equal(again.nextChange, 7000);
  // Typing kept up is a new time, counted from its own arrival.
  const kept = shownTypists({
    arrivedAt: 6000,
    lastSentAt: NOBODY_SENT,
    now: 6500,
    scope: "b",
    typists: [typist(MAYA, 3100)],
  });
  assert.equal(kept.nextChange, 12_000);
});

void test("typists stay in the order they started", () => {
  const shown = shownTypists({
    arrivedAt: 0,
    lastSentAt: NOBODY_SENT,
    now: 0,
    scope: "c",
    typists: [
      { ...typist(LEO, 900), startedAt: 300 },
      { ...typist(MAYA, 800), startedAt: 100 },
      // The same person from a second PDS's answer counts once.
      { ...typist(MAYA, 700), startedAt: 100 },
    ],
  });
  assert.deepEqual(shown.accountIds, [MAYA, LEO]);
});

void test("someone whose message came after their typing has sent it", () => {
  const typists = [typist(MAYA, 1000), typist(LEO, 1000)];
  const shown = shownTypists({
    arrivedAt: 0,
    lastSentAt: lastSentByAuthor([
      { authorId: MAYA, sentAt: new Date(1200) },
      { authorId: LEO, sentAt: new Date(900) },
    ]),
    now: 0,
    scope: "d",
    typists,
  });
  assert.deepEqual(shown.accountIds, [LEO]);
});

void test("the label names up to three people, then counts them", () => {
  assert.equal(typingLabel(["Maya Chen"]), "Maya Chen is typing");
  assert.equal(
    typingLabel(["Maya Chen", "Leo Martins"]),
    "Maya and Leo are typing",
  );
  assert.equal(
    typingLabel(["Maya Chen", "Leo Martins", "Priya"]),
    "Maya, Leo, and Priya are typing",
  );
  assert.equal(typingLabel(["a", "b", "c", "d", "e"]), "5 people are typing");
});

void test("photos show for up to four people, then three and a count", () => {
  assert.deepEqual(typingFaces([1, 2, 3, 4]), {
    faces: [1, 2, 3, 4],
    more: 0,
  });
  assert.deepEqual(typingFaces([1, 2, 3, 4, 5, 6, 7]), {
    faces: [1, 2, 3],
    more: 4,
  });
});

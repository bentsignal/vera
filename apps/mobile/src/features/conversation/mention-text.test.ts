import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deleteWholeMention,
  insertMention,
  isPicked,
  keptMentions,
  mentionQuery,
  mentionRanges,
  suggestions,
} from "./mention-text.ts";

const MAYA = {
  accountId: "maya@vera.chat",
  avatarUrl: null,
  displayName: "Maya Chen",
};
const LEO = {
  accountId: "leo@vera.chat",
  avatarUrl: null,
  displayName: "Leo Martins",
};
const JONAH = {
  accountId: "jw@vera.chat",
  avatarUrl: null,
  displayName: "Jonah Weiss",
};

void test("a contact is suggested by your name for them or their own", () => {
  const mom = { ...MAYA, displayName: "Mom", mentionName: "Maya Chen" };
  assert.deepEqual(suggestions([mom, LEO], "mo"), [mom]);
  assert.deepEqual(suggestions([mom, LEO], "chen"), [mom]);
});

void test("finds the name being typed after an @", () => {
  assert.deepEqual(mentionQuery("hi @ma", 6), { query: "ma", start: 3 });
  assert.deepEqual(mentionQuery("@", 1), { query: "", start: 0 });
  assert.deepEqual(mentionQuery("@Maya Ch", 8), { query: "Maya Ch", start: 0 });
  // Only up to the cursor.
  assert.deepEqual(mentionQuery("@maya later", 3), { query: "ma", start: 0 });
});

void test("an @ inside a word or after a line doesn't look for anyone", () => {
  assert.equal(mentionQuery("me@vera", 7), null);
  assert.equal(mentionQuery("@maya\nok", 8), null);
  assert.equal(mentionQuery("no at here", 5), null);
  assert.equal(mentionQuery("@ maya", 6), null);
  assert.equal(mentionQuery("@maya  chen", 11), null);
});

void test("suggests people by any word of their name or their username", () => {
  const people = [MAYA, LEO, JONAH];
  assert.deepEqual(
    suggestions(people, "").map(({ displayName }) => displayName),
    ["Jonah Weiss", "Leo Martins", "Maya Chen"],
  );
  assert.deepEqual(suggestions(people, "ch"), [MAYA]);
  assert.deepEqual(suggestions(people, "maya c"), [MAYA]);
  assert.deepEqual(suggestions(people, "jw"), [JONAH]);
  assert.deepEqual(suggestions(people, "x"), []);
});

void test("puts the picked name in place of what was typed", () => {
  assert.deepEqual(insertMention("hi @ma", 3, 6, "Maya Chen"), {
    cursor: 14,
    text: "hi @Maya Chen ",
  });
  assert.deepEqual(insertMention("@ma there", 0, 3, "Maya Chen"), {
    cursor: 11,
    text: "@Maya Chen there",
  });
});

void test("finds each mention in the text, longest names first", () => {
  const mentions = [
    { accountId: MAYA.accountId, name: "Maya" },
    { accountId: "mc@vera.chat", name: "Maya Chen" },
  ];
  assert.deepEqual(mentionRanges("@Maya Chen and @Maya", mentions), [
    { accountId: "mc@vera.chat", end: 10, start: 0 },
    { accountId: MAYA.accountId, end: 20, start: 15 },
  ]);
  assert.deepEqual(mentionRanges("nobody", mentions), []);
  assert.deepEqual(mentionRanges("@Maya", undefined), []);
});

void test("keeps only mentions still in the text", () => {
  const mentions = [
    { accountId: MAYA.accountId, name: "Maya Chen" },
    { accountId: LEO.accountId, name: "Leo Martins" },
  ];
  assert.deepEqual(keptMentions("@Maya Chen hi @Leo Mart", mentions), [
    mentions[0],
  ]);
});

void test("deleting into a mention deletes all of it", () => {
  const mentions = [{ accountId: MAYA.accountId, name: "Maya Chen" }];
  assert.deepEqual(
    deleteWholeMention("hi @Maya Chen", "hi @Maya Che", mentions),
    {
      cursor: 3,
      text: "hi ",
    },
  );
  // The space after it goes on its own.
  assert.equal(deleteWholeMention("@Maya Chen ", "@Maya Chen", mentions), null);
  // Typing, or deleting outside it, is an ordinary edit.
  assert.equal(deleteWholeMention("@Maya Chen", "@Maya Chen!", mentions), null);
  assert.equal(
    deleteWholeMention("ok @Maya Chen", "o @Maya Chen", mentions),
    null,
  );
});

void test("a picked name followed by a space is done being searched", () => {
  const mentions = [{ accountId: "jonah@vera.chat", name: "Jonah Weiss" }];
  const typed = "hi @Jonah Weiss ";
  const query = mentionQuery(typed, typed.length);
  assert.equal(query?.query, "Jonah Weiss ");
  assert.equal(isPicked("Jonah Weiss ", mentions), true);
  assert.equal(isPicked("Jonah W", mentions), false);
});

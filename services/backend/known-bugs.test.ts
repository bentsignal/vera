import assert from "node:assert/strict";
import { test } from "node:test";

import {
  briefOf,
  importedStage,
  keywordMatches,
  keywordsOf,
  kindOf,
  statusOf,
} from "./known-bugs.ts";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-10-21T00:00:00Z");

void test("a known bug's status says how far it's come", () => {
  assert.equal(statusOf({ stage: "reported" }), "open");
  assert.equal(statusOf({ stage: "pickedUp" }), "being fixed");
  assert.equal(statusOf({ stage: "inProgress" }), "being fixed");
  assert.equal(statusOf({ stage: "fixed" }), "fixed, not out yet");
  assert.equal(statusOf({ stage: "live" }), "fixed and out");
  assert.equal(
    statusOf({ stage: "live", stillOpen: true }),
    "a fix went out, but it's still open",
  );
  assert.equal(statusOf({ stage: "closed" }), "closed");
  assert.equal(statusOf({ duplicateOf: 225, stage: "closed" }), "duplicate");
});

const filedBody = [
  "## What happened",
  "",
  "Sometimes when opening a chat, the person's **own** older messages stack at the bottom.",
  "",
  "## Steps to reproduce",
  "",
  "Open a chat that already has older messages.",
  "",
  "## App",
  "",
  "- Version: 0.1.0 (9)",
  "",
  "---",
  "",
  "Reported in the app through Vera Support.",
].join("\n");

void test("a brief of an issue support filed is what happened, without Markdown", () => {
  assert.equal(
    briefOf(filedBody),
    "Sometimes when opening a chat, the person's own older messages stack at the bottom.",
  );
});

void test("a brief of another issue is the start of its body", () => {
  assert.equal(
    briefOf(
      "<!-- template -->\n### Bug\nSee [the screen](https://example.com) ![shot](x.png)\nIt crashes.",
    ),
    "Bug See the screen It crashes.",
  );
});

void test("a long brief is cut at a word", () => {
  const brief = briefOf("word ".repeat(100), 30);
  assert.equal(brief, "word word word word word word…");
});

void test("an imported issue is an idea when it's labeled one", () => {
  assert.equal(kindOf(["enhancement"]), "idea");
  assert.equal(kindOf(["bug", "user report"]), "bug");
  assert.equal(kindOf([]), "bug");
});

void test("imported open issues, duplicates, and recent fixes are checked; old closed ones settle", () => {
  const issue = { closedAt: null, open: true, stateReason: null };
  assert.deepEqual(importedStage(issue, now), {
    active: true,
    stage: "reported",
  });
  assert.deepEqual(
    importedStage(
      { closedAt: now - 100 * DAY, open: false, stateReason: "duplicate" },
      now,
    ),
    { active: true, stage: "closed" },
  );
  assert.deepEqual(
    importedStage(
      { closedAt: now - DAY, open: false, stateReason: "not_planned" },
      now,
    ),
    { active: false, stage: "closed" },
  );
  assert.deepEqual(
    importedStage(
      { closedAt: now - DAY, open: false, stateReason: "completed" },
      now,
    ),
    { active: true, stage: "fixed" },
  );
  assert.deepEqual(
    importedStage(
      { closedAt: now - 60 * DAY, open: false, stateReason: "completed" },
      now,
    ),
    { active: false, stage: "live" },
  );
});

void test("keywords drop filler words and match plurals and tenses", () => {
  assert.deepEqual(
    [...keywordsOf("The photos were showing sideways in groups")],
    ["photo", "show", "sideway", "group"],
  );
  assert.deepEqual(keywordsOf("Opened"), keywordsOf("opening"));
  assert.deepEqual(keywordsOf("messages"), keywordsOf("message"));
});

const bugs = [
  {
    description: "Portrait photos rotate in group chats.",
    reportedAt: now - 3 * DAY,
    title: "Photos show sideways in groups",
  },
  {
    description:
      "An older message the person sent appears out of chronological order.",
    reportedAt: now - 2 * DAY,
    title: "Opening a chat shows an older message from you out of order",
  },
  {
    description: "Older messages pile at the bottom of the screen.",
    reportedAt: now - DAY,
    summary: "older messages stacked at the bottom",
    title: "Older messages pile at the bottom when opening a chat",
  },
];

void test("keyword matches rank title words above description words", () => {
  const found = keywordMatches(
    bugs,
    "messages out of order when I open a chat",
  );
  assert.deepEqual(
    found.map((bug) => bug.title),
    [
      "Opening a chat shows an older message from you out of order",
      "Older messages pile at the bottom when opening a chat",
      // Only "chats" in its description.
      "Photos show sideways in groups",
    ],
  );
});

void test("keyword matches leave out bugs with nothing in common", () => {
  assert.deepEqual(
    keywordMatches(bugs, "sideways photo").map((bug) => bug.title),
    ["Photos show sideways in groups"],
  );
  assert.deepEqual(keywordMatches(bugs, "the app is not working"), []);
  assert.deepEqual(keywordMatches(bugs, "notifications late"), []);
});

void test("keyword matches break ties by the newest and stop at the limit", () => {
  const found = keywordMatches(bugs, "chat", 1);
  assert.deepEqual(
    found.map((bug) => bug.title),
    ["Older messages pile at the bottom when opening a chat"],
  );
});

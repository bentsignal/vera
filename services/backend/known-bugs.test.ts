import assert from "node:assert/strict";
import { test } from "node:test";

import { briefOf, statusOf } from "./known-bugs.ts";

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

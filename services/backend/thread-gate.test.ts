import assert from "node:assert/strict";
import { test } from "node:test";

import { gateChoice, gateRequest } from "./thread-gate.ts";

const NOW = 1_000_000;

const thread = [
  {
    from: "Maya",
    messageId: "root",
    sentAt: NOW - 60_000,
    text: "@Vera dinner near Union Square?",
  },
  {
    from: "Vera",
    messageId: "answer",
    sentAt: NOW - 55_000,
    text: "Try Souvla.",
  },
  {
    from: "Jonah",
    messageId: "lol",
    sentAt: NOW - 9_000,
    text: "souvla is so good",
  },
  {
    from: "Maya",
    messageId: "late",
    sentAt: NOW - 4_000,
    text: "is it open late?",
  },
];

void test("labels the thread oldest first and offers only the new replies", () => {
  const { request } = gateRequest("Vera", thread, ["lol", "late"], NOW);
  assert.deepEqual(
    request.state.thread.map((message) => [
      message.id,
      message.from,
      message.secondsAgo,
    ]),
    [
      ["m1", "Maya", 60],
      ["m2", "Vera", 55],
      ["m3", "Jonah", 9],
      ["m4", "Maya", 4],
    ],
  );
  assert.deepEqual(request.state.newMessages, ["m3", "m4"]);
  assert.deepEqual(Object.keys(request.questions.forAssistant.criteria), [
    "m3",
    "m4",
    "none",
  ]);
});

void test("reads only the newest 20 messages", () => {
  const long = Array.from({ length: 30 }, (_, index) => ({
    from: "Maya",
    messageId: `m${index}`,
    sentAt: NOW - (30 - index) * 1000,
    text: String(index),
  }));
  const { request } = gateRequest("Vera", long, ["m29"], NOW);
  assert.equal(request.state.thread.length, 20);
  assert.equal(request.state.thread.at(0)?.text, "10");
  assert.deepEqual(request.state.newMessages, ["m20"]);
});

void test("maps the choice back to its message, and none to nothing", () => {
  const { labels } = gateRequest("Vera", thread, ["lol", "late"], NOW);
  assert.equal(gateChoice("m4", labels, ["lol", "late"])?.messageId, "late");
  assert.equal(gateChoice("none", labels, ["lol", "late"]), null);
});

void test("never answers a message it wasn't offered", () => {
  const { labels } = gateRequest("Vera", thread, ["late"], NOW);
  assert.equal(gateChoice("m2", labels, ["late"]), null);
  assert.equal(gateChoice("m9", labels, ["late"]), null);
});

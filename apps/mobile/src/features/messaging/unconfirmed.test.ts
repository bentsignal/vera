import assert from "node:assert/strict";
import { test } from "node:test";

import { unconfirmedSends } from "./unconfirmed.ts";

const minute = 60_000;
const at625 = Date.UTC(2026, 9, 20, 18, 25);
const at702 = Date.UTC(2026, 9, 20, 19, 2);

/** The latest 50 messages, from 7:02 on, with older ones before them. */
const latest = {
  live: true,
  hasOlder: true,
  messages: Array.from({ length: 50 }, (_, index) => ({
    messageId: `m${index}`,
    sentAt: at702 + index * 5_000,
  })),
};

function send(
  messageId: string,
  sentAt: number,
  status: "failed" | "sending" | "sent" = "sent",
) {
  return { messageId, sentAt, status };
}

function ids(sends: readonly { messageId: string }[]) {
  return sends.map((message) => message.messageId);
}

void test("a send from before the window's messages doesn't show below them (#192)", () => {
  const outbox = [send("early", at625), send("earlier", at625 - minute)];
  assert.deepEqual(unconfirmedSends(outbox, latest), []);
});

void test("a send the PDS took that the pages don't list yet shows", () => {
  const outbox = [send("early", at625), send("now", at702 + 10 * minute)];
  assert.deepEqual(ids(unconfirmedSends(outbox, latest)), ["now"]);
});

void test("a send still on its way or that failed shows, however old", () => {
  const outbox = [
    send("failed", at625, "failed"),
    send("sending", at702 + 10 * minute, "sending"),
  ];
  assert.deepEqual(ids(unconfirmedSends(outbox, latest)), [
    "failed",
    "sending",
  ]);
});

void test("a send the pages list shows there, not again", () => {
  const outbox = [send("m49", at702 + 49 * 5_000)];
  assert.deepEqual(unconfirmedSends(outbox, latest), []);
});

void test("with every message loaded, any send not listed yet shows", () => {
  const outbox = [send("early", at625)];
  const everything = { ...latest, hasOlder: false };
  assert.deepEqual(ids(unconfirmedSends(outbox, everything)), ["early"]);
});

void test("away from the latest messages, no send shows", () => {
  const outbox = [send("now", at702 + 10 * minute, "sending")];
  assert.deepEqual(unconfirmedSends(outbox, { ...latest, live: false }), []);
});

void test("in a burst, your sends keep showing while the next page loads", () => {
  // 50 messages arrived after the window opened: its newest page is full,
  // and the next has yet to load. Yours, sent mid-burst, stay at the
  // bottom until a page lists them (the PDS may take them a while).
  const outbox = [
    send("mid", at702 + 10 * minute, "sending"),
    send("taken", at702 + 11 * minute, "sent"),
  ];
  assert.deepEqual(ids(unconfirmedSends(outbox, latest)), ["mid", "taken"]);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { mentionableIn } from "./mentionable.ts";

const ME = "me@vera.chat";
const MAYA = "maya@vera.chat";
const LEO = "leo@vera.chat";
const VERA = "vera@vera.chat";

function profileOf(accountId: string) {
  return { avatarUrl: null, displayName: accountId.split("@")[0] ?? "" };
}

function ids(list: ReturnType<typeof mentionableIn>) {
  return list?.map(({ accountId }) => accountId);
}

void test("a group lists its members but you, then Vera", () => {
  const group = { kind: "group" as const, members: [ME, MAYA, LEO] };
  assert.deepEqual(ids(mentionableIn(group, ME, profileOf)), [MAYA, LEO, VERA]);
});

void test("a direct message with someone lists only Vera", () => {
  const direct = { kind: "direct" as const, members: [ME, MAYA] };
  assert.deepEqual(ids(mentionableIn(direct, ME, profileOf)), [VERA]);
});

void test("your direct message with Vera lists nobody", () => {
  const direct = { kind: "direct" as const, members: [ME, VERA] };
  assert.equal(mentionableIn(direct, ME, profileOf), undefined);
});

void test("Vera is listed once, even as a member", () => {
  const group = { kind: "group" as const, members: [ME, VERA, MAYA] };
  assert.deepEqual(ids(mentionableIn(group, ME, profileOf)), [VERA, MAYA]);
});

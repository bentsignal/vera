import assert from "node:assert/strict";
import test from "node:test";

import type { Conversation } from "./protocol.ts";
import { inboxRowIncludes } from "./includes.ts";

const ME = "me@vera.chat";
const MAYA = "maya@vera.chat";

function row(conversationId: string, members: string[]): Conversation {
  return {
    alerts: "all",
    conversationId,
    kind: "direct",
    lastMessage: null,
    members,
    muted: false,
    name: null,
    spaceId: null,
    unreadCount: 0,
    updatedAt: 1,
  };
}

void test("the inbox list's first answer brings each row, already answered", () => {
  const rows = [row("direct:a", [ME, MAYA])];
  const included = inboxRowIncludes(ME, rows);
  const answered = included.filter((entry) => "request" in entry);
  assert.deepEqual(
    answered.map((entry) =>
      "request" in entry
        ? [
            entry.request.operation.type,
            entry.request.operation.args,
            entry.value,
          ]
        : null,
    ),
    [["conversation", { conversationId: "direct:a" }, rows[0]]],
  );
  // And who the rows show, for the PDS to answer.
  const asked = included.filter((entry) => !("request" in entry));
  assert.deepEqual(
    asked.map((entry) => ("operation" in entry ? entry.operation.args : null)),
    [{ accountId: MAYA }],
  );
});

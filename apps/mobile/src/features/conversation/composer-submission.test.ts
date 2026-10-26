import assert from "node:assert/strict";
import { test } from "node:test";

import { composerSubmission } from "./composer-submission.ts";
import { createSendCommit } from "./send-commit.ts";

void test("clear and enqueue respond synchronously, then register actual local ID", () => {
  const commit = createSendCommit();
  const events = new Array<string>();
  const send = composerSubmission(
    {
      canSend: true,
      edit: undefined,
      onSend: (text) => {
        events.push(`enqueue:${text}`);
        return "outbox-id";
      },
    },
    {
      draft: "  hello  ",
      clear: 3,
      sent: () => {
        events.push("clear");
        return [];
      },
      saved: () => [],
    },
    commit,
    {
      staged: [],
      begin: () => events.push("probe"),
      settle: (adds, clear, files) => {
        assert.equal(adds, true);
        return commit.begin(clear, files);
      },
    },
  );
  send();
  assert.deepEqual(events, ["probe", "clear", "enqueue:hello"]);
  assert.equal(commit.read().messageId, "outbox-id");
  assert.equal(commit.read().clear, 4);
});

void test("a synchronous enqueue failure cancels identity without waiting for a row", () => {
  const commit = createSendCommit();
  const send = composerSubmission(
    {
      canSend: true,
      edit: undefined,
      onSend: () => {
        throw new Error("enqueue failed");
      },
    },
    { draft: "hello", clear: 0, sent: () => [], saved: () => [] },
    commit,
    {
      staged: [],
      begin: () => undefined,
      settle: (_adds, clear, files) => commit.begin(clear, files),
    },
  );
  assert.throws(send, /enqueue failed/);
  assert.equal(commit.read().cancelled, true);
  assert.equal(commit.read().messageId, undefined);
});

void test("an invalid submit does not arm a hold or clear anything", () => {
  const commit = createSendCommit();
  function unexpected() {
    return assert.fail("unexpected action");
  }
  const send = composerSubmission(
    { canSend: false, edit: undefined, onSend: unexpected },
    { draft: "", clear: 0, sent: unexpected, saved: unexpected },
    commit,
    { staged: [], begin: unexpected, settle: unexpected },
  );
  send();
  assert.equal(commit.read().sequence, 0);
});

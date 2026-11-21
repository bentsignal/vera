import assert from "node:assert/strict";
import test from "node:test";

import { accountsProtocol } from "./protocol.ts";

// A profile is believed only from the account's own PDS, and only as the
// profile that was asked for.

const { getProfile } = accountsProtocol.queries;
function fromLiar(accountId: string) {
  return {
    args: { accountId },
    owns: (address: string) => address.endsWith("@liar.test"),
  };
}

function profile(accountId: string) {
  return { accountId, affiliated: true, avatarUrl: null, displayName: "Maya" };
}

void test("a PDS can't answer with another server's account's profile", () => {
  assert.equal(
    getProfile.trust?.(profile("maya@vera.chat"), fromLiar("maya@vera.chat")),
    null,
  );
});

void test("a PDS can't pass one of its accounts off as the one asked for", () => {
  assert.equal(
    getProfile.trust?.(profile("mallory@liar.test"), fromLiar("bob@liar.test")),
    null,
  );
});

void test("a PDS's own account's profile is believed", () => {
  assert.deepEqual(
    getProfile.trust?.(profile("bob@liar.test"), fromLiar("Bob@liar.test")),
    profile("bob@liar.test"),
  );
});

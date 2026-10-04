import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_RESERVED_USERNAMES, isReservedUsername } from "./reserved.ts";

void test("reserves the default operator names", () => {
  for (const name of ["admin", "help", "support", "security", "root"]) {
    assert.ok(DEFAULT_RESERVED_USERNAMES.includes(name));
    assert.ok(isReservedUsername(name));
  }
  assert.equal(isReservedUsername("alice"), false);
});

void test("ignores case, separators, and trailing digits", () => {
  assert.ok(isReservedUsername("Support"));
  assert.ok(isReservedUsername("helpdesk"));
  assert.ok(isReservedUsername("help.desk"));
  assert.ok(isReservedUsername("help-desk2"));
  assert.ok(isReservedUsername("admin_1"));
  assert.ok(isReservedUsername("noreply"));
  assert.equal(isReservedUsername("helper"), false);
  assert.equal(isReservedUsername("support_alice"), false);
});

void test("checks a host's own list", () => {
  const reserved = [...DEFAULT_RESERVED_USERNAMES, "vera", "vera_support"];
  assert.ok(isReservedUsername("vera", reserved));
  assert.ok(isReservedUsername("verasupport", reserved));
  assert.ok(isReservedUsername("admin", reserved));
  assert.equal(isReservedUsername("vera", DEFAULT_RESERVED_USERNAMES), false);
  assert.equal(isReservedUsername("admin", ["vera"]), false);
});

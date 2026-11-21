import assert from "node:assert/strict";
import test from "node:test";

import { visitorHome } from "./pds-router.ts";

void test("this PDS's own accounts aren't visitors", () => {
  assert.equal(visitorHome("me@vera.chat", "vera.chat"), undefined);
  assert.equal(visitorHome("me@Vera.Chat", " VERA.chat "), undefined);
});

void test("anyone else is a visitor from their home domain", () => {
  assert.equal(visitorHome("them@other.example", "vera.chat"), "other.example");
  // A subdomain is another server.
  assert.equal(
    visitorHome("them@evil.vera.chat", "vera.chat"),
    "evil.vera.chat",
  );
  assert.equal(
    visitorHome("vera.chat@other.example", "vera.chat"),
    "other.example",
  );
  // No address: never one of ours.
  assert.equal(visitorHome(undefined, "vera.chat"), "");
  assert.equal(visitorHome("no-domain", "vera.chat"), "");
});

import assert from "node:assert/strict";
import test from "node:test";

import { linkKind } from "./link-kind.ts";

void test("opens web, email and phone links", () => {
  assert.equal(linkKind("https://x.com/vera/status/1"), "web");
  assert.equal(linkKind("http://example.com"), "web");
  assert.equal(linkKind("mailto:help@vera.chat"), "email");
  assert.equal(linkKind("tel:+15551234567"), "phone");
});

void test("never opens any other kind of address", () => {
  for (const url of [
    "intent://scan/#Intent;scheme=zxing;package=com.example;end",
    "intent:#Intent;component=com.example/.Secret;end",
    "javascript:alert(1)",
    "file:///data/data/chat.vera.app/files/x",
    "content://com.example.provider/x",
    "vera://settings",
    "market://details?id=com.example",
    "not a link",
  ]) {
    assert.equal(linkKind(url), undefined, url);
  }
});

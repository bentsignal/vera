import assert from "node:assert/strict";
import { test } from "node:test";
import { ConvexError } from "convex/values";

import { retryAfter } from "./send-limit.ts";

void test("a send over the limit waits as long as the PDS says", () => {
  const refused = new ConvexError({ code: "RATE_LIMITED", retryAfterMs: 1500 });
  assert.equal(retryAfter(refused), 1500);
});

void test("any other failure isn't waited out", () => {
  assert.equal(
    retryAfter(new ConvexError({ code: "CONVERSATION_NOT_FOUND" })),
    undefined,
  );
  assert.equal(retryAfter(new Error("offline")), undefined);
});

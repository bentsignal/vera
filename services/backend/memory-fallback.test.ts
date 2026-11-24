import assert from "node:assert/strict";
import { test } from "node:test";

import { unlessMemoryFails } from "./memory-fallback.ts";

void test("a working lookup returns what it found", async () => {
  assert.deepEqual(
    await unlessMemoryFails(() => Promise.resolve(["passage"]), []),
    ["passage"],
  );
});

void test("a failed lookup returns the fallback instead of throwing", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  assert.deepEqual(
    await unlessMemoryFails(
      () => Promise.reject(new Error("Provider returned error")),
      [],
    ),
    [],
  );
});

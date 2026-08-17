import assert from "node:assert/strict";
import test from "node:test";

import {
  DECENTRALIZED_CONVEX_LAST_CHANGED,
  DECENTRALIZED_CONVEX_RELEASES,
  DECENTRALIZED_CONVEX_VERSION,
} from "./index.ts";

void test("the current release and every last-changed value are known", () => {
  assert.equal(
    DECENTRALIZED_CONVEX_RELEASES.at(-1),
    DECENTRALIZED_CONVEX_VERSION,
  );
  for (const lastChanged of Object.values(DECENTRALIZED_CONVEX_LAST_CHANGED)) {
    assert.ok(DECENTRALIZED_CONVEX_RELEASES.includes(lastChanged));
  }
});

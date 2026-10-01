import assert from "node:assert/strict";
import test from "node:test";

import { decentralizedConvexPackage } from "../metadata.ts";
import {
  DECENTRALIZED_CONVEX_RELEASES,
  DECENTRALIZED_CONVEX_VERSION,
  defineDecentralizedConvexPackage,
} from "./index.ts";

void test("defines package-owned metadata against the current release", () => {
  assert.equal(
    DECENTRALIZED_CONVEX_RELEASES.at(-1),
    DECENTRALIZED_CONVEX_VERSION,
  );
  assert.deepEqual(decentralizedConvexPackage, {
    lastChanged: "0.1.0",
    name: "@decentralized-convex/core",
    version: "0.1.0",
  });
  assert.deepEqual(
    defineDecentralizedConvexPackage({
      lastChanged: "0.1.0",
      name: "@decentralized-convex/example",
    }),
    {
      lastChanged: "0.1.0",
      name: "@decentralized-convex/example",
      version: "0.1.0",
    },
  );
});

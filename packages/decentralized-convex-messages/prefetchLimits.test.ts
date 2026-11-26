import assert from "node:assert/strict";
import test from "node:test";

import type { LinkPreview } from "./protocol.ts";
import { fakeCtx } from "./fakeCtx.ts";
import { storeResult } from "./linkCache.ts";
import {
  claimPrefetches,
  PREFETCH_BURST,
  PREFETCH_REFILL_MS,
} from "./prefetchLimits.ts";

const A = "https://a.com/story";
const B = "https://b.com";
const PREVIEW_A: LinkPreview = { title: "A story", url: "https://a.com/s" };

void test("prefetching stops at the account's allowance, and refills", async () => {
  const { ctx } = fakeCtx({});
  function links(from: number) {
    return Array.from(
      { length: 4 },
      (_, index) => `https://site${from + index}.com/`,
    );
  }
  let claimed = 0;
  for (let call = 0; claimed < PREFETCH_BURST; call++) {
    const got = await claimPrefetches(ctx, "me@vera.chat", links(call * 4), 0);
    assert.ok(got.length > 0, "the allowance ran out early");
    claimed += got.length;
  }
  assert.equal(claimed, PREFETCH_BURST);
  // Out: new links start nothing.
  assert.deepEqual(
    await claimPrefetches(ctx, "me@vera.chat", links(1000), 1),
    [],
  );
  // Someone else has their own allowance.
  assert.equal(
    (await claimPrefetches(ctx, "you@vera.chat", links(2000), 1)).length,
    4,
  );
  // One comes back after the refill time.
  assert.equal(
    (
      await claimPrefetches(
        ctx,
        "me@vera.chat",
        links(3000),
        PREFETCH_REFILL_MS,
      )
    ).length,
    1,
  );
});

void test("prefetching links already cached costs nothing", async () => {
  const { ctx } = fakeCtx({});
  await storeResult(ctx, A, PREVIEW_A, 0);
  for (let call = 0; call < PREFETCH_BURST * 2; call++) {
    assert.deepEqual(await claimPrefetches(ctx, "me@vera.chat", [A], 1), []);
  }
  assert.equal((await claimPrefetches(ctx, "me@vera.chat", [B], 1)).length, 1);
});

import assert from "node:assert/strict";
import test from "node:test";

import type { SendBucket } from "./send-limits.ts";
import {
  currentDomainSends,
  currentSends,
  DOMAIN_SEND_BURST,
  DOMAIN_SEND_REFILL_MS,
  SEND_BURST,
  SEND_REFILL_MS,
  sendKey,
  takeDomainSend,
  takeSend,
} from "./send-limits.ts";

const ME = "me@vera.chat";

/** Sends `count` messages `apart` ms apart; how many were refused. */
function burst(count: number, apart: number) {
  let bucket: SendBucket | null = null;
  let refused = 0;
  for (let index = 0; index < count; index += 1) {
    const result = takeSend(currentSends(bucket, ME, index * apart));
    if (result.ok) bucket = result.bucket;
    else refused += 1;
  }
  return refused;
}

void test("a fast typist never hits the limit", () => {
  // A message every second for most of a minute, faster than anyone
  // keeps up.
  assert.equal(burst(50, 1000), 0);
  // A quick run of short messages.
  assert.equal(burst(SEND_BURST, 300), 0);
});

void test("a script sending faster than one every two seconds does", () => {
  // The burst that broke the list: 1.2 a second from one account.
  assert.ok(burst(100, 830) > 0);
  assert.ok(burst(300, 0) === 300 - SEND_BURST);
});

void test("a refusal says when to try again and takes nothing", () => {
  const empty = { accountId: ME, tokens: 0.25, updatedAt: 0 };
  const refused = takeSend(empty);
  assert.deepEqual(refused, {
    ok: false,
    retryAfterMs: Math.ceil(0.75 * SEND_REFILL_MS),
  });
  const later = currentSends(empty, ME, refused.retryAfterMs);
  assert.equal(takeSend(later).ok, true);
});

void test("the bucket refills up to a burst, never past it", () => {
  const bucket = currentSends(
    { accountId: ME, tokens: 0, updatedAt: 0 },
    ME,
    1e9,
  );
  assert.equal(bucket.tokens, SEND_BURST);
  // A clock that went backwards doesn't drain it.
  const back = currentSends(
    { accountId: ME, tokens: 5, updatedAt: 1000 },
    ME,
    0,
  );
  assert.equal(back.tokens, 5);
});

void test("writing an address differently doesn't give a fresh allowance", () => {
  assert.equal(sendKey(" Me@Vera.Chat "), ME);
  assert.equal(sendKey("ME@VERA.CHAT"), sendKey(ME));
});

/** Sends from many accounts of one server, `apart` ms apart; refused. */
function domainBurst(count: number, apart: number) {
  let bucket: { tokens: number; updatedAt: number } | null = null;
  let refused = 0;
  for (let index = 0; index < count; index += 1) {
    const result = takeDomainSend(currentDomainSends(bucket, index * apart));
    if (result.ok) bucket = result.bucket;
    else refused += 1;
  }
  return refused;
}

void test("a small server's visitors never reach their server's ceiling", () => {
  // Ten people each at their own limit, together.
  assert.equal(domainBurst(600, SEND_REFILL_MS / 10), 0);
  assert.ok(DOMAIN_SEND_BURST >= 10 * SEND_BURST);
});

void test("a server with thousands of accounts can't multiply the limit", () => {
  // A thousand fresh accounts each sending their burst at once.
  assert.equal(
    domainBurst(1000 * SEND_BURST, 0),
    1000 * SEND_BURST - DOMAIN_SEND_BURST,
  );
  const empty = { tokens: 0, updatedAt: 0 };
  assert.deepEqual(takeDomainSend(empty), {
    ok: false,
    retryAfterMs: DOMAIN_SEND_REFILL_MS,
  });
});

// How fast one person can send messages (convex/sendLimits.ts), as plain
// functions so they can be tested without Convex.
//
// A token bucket per account: 30 messages at once, refilling one every 2
// seconds (30 a minute). Someone sending one-word messages as fast as they
// can type them stays well inside it; a script sending more than one a
// second runs it dry in under a minute.

/** Messages someone can send at once. */
export const SEND_BURST = 30;
/** How long one message takes to come back. */
export const SEND_REFILL_MS = 2000;

export interface SendBucket {
  accountId: string;
  tokens: number;
  updatedAt: number;
}

/** The account's bucket now, refilled since it was last used. */
export function currentSends(
  bucket: SendBucket | null,
  accountId: string,
  now: number,
): SendBucket {
  if (bucket === null) return { accountId, tokens: SEND_BURST, updatedAt: now };
  return {
    accountId,
    tokens: Math.min(
      SEND_BURST,
      bucket.tokens + Math.max(0, now - bucket.updatedAt) / SEND_REFILL_MS,
    ),
    updatedAt: now,
  };
}

/**
 * Takes one message from the bucket: the bucket after, or a refusal with
 * how long until one is back. A refusal takes nothing.
 */
export function takeSend(bucket: SendBucket) {
  if (bucket.tokens >= 1) {
    return {
      bucket: { ...bucket, tokens: bucket.tokens - 1 },
      ok: true as const,
    };
  }
  return {
    ok: false as const,
    retryAfterMs: Math.ceil((1 - bucket.tokens) * SEND_REFILL_MS),
  };
}

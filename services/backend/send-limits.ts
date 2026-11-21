// How fast one person can send messages (convex/sendLimits.ts), as plain
// functions so they can be tested without Convex.
//
// A token bucket per account: 30 messages at once, refilling one every 2
// seconds (30 a minute). Someone sending one-word messages as fast as they
// can type them stays well inside it; a script sending more than one a
// second runs it dry in under a minute.

// On top of that, a ceiling for each other server whose accounts sign in
// here as visitors: 300 messages at once, refilling one every 200 ms (300 a
// minute, ten accounts' worth). Visitors' messages are normally stored on
// their own server, so an honest one never comes near it; it stops a server
// that makes accounts by the thousand from multiplying the limit above.

/** Messages someone can send at once. */
export const SEND_BURST = 30;
/** How long one message takes to come back. */
export const SEND_REFILL_MS = 2000;

/** Messages all the visitors from one other server can send at once. */
export const DOMAIN_SEND_BURST = 300;
/** How long one of them takes to come back. */
export const DOMAIN_SEND_REFILL_MS = 200;

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

/** A server's bucket now, refilled since it was last used. */
export function currentDomainSends(
  bucket: Omit<SendBucket, "accountId"> | null,
  now: number,
) {
  if (bucket === null) return { tokens: DOMAIN_SEND_BURST, updatedAt: now };
  return {
    tokens: Math.min(
      DOMAIN_SEND_BURST,
      bucket.tokens +
        Math.max(0, now - bucket.updatedAt) / DOMAIN_SEND_REFILL_MS,
    ),
    updatedAt: now,
  };
}

/** `takeSend` for a server's bucket. */
export function takeDomainSend(bucket: { tokens: number; updatedAt: number }) {
  if (bucket.tokens >= 1) {
    return {
      bucket: { ...bucket, tokens: bucket.tokens - 1 },
      ok: true as const,
    };
  }
  return {
    ok: false as const,
    retryAfterMs: Math.ceil((1 - bucket.tokens) * DOMAIN_SEND_REFILL_MS),
  };
}

/**
 * The key a person's allowance is kept under: their address as the
 * messages plugin reads it (trimmed, lowercase), so writing it differently
 * doesn't give them a fresh one.
 */
export function sendKey(accountId: string) {
  return accountId.trim().toLowerCase();
}

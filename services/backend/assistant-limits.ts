// The decisions behind assistant rate limits (convex/rateLimits.ts), as
// plain functions so they can be tested without Convex.

export type AssistantName = "support" | "vera";

/**
 * Each assistant's allowance, per person and counted separately, so
 * reporting bugs never eats into time with Vera or the other way around.
 */
export const LIMITS: Record<
  AssistantName,
  { readonly name: string; readonly perHour: number }
> = {
  support: { name: "Vera Support", perHour: 300 },
  vera: { name: "Vera", perHour: 300 },
};

const PERIOD = 60 * 60 * 1000;
export const STRIKES_PER_DAY = 5;
const DAY = 24 * 60 * 60 * 1000;

/** How every automatic limit notice starts, so the model can tell it didn't write it. */
export const LIMIT_NOTICE_START = "You've hit the";

export interface Bucket {
  accountId: string;
  bot: AssistantName;
  limited?: boolean;
  lockNoticeSent?: boolean;
  strikes?: number;
  strikesSince?: number;
  tokens: number;
  updatedAt: number;
}

/** How long one reply takes to come back. */
function refill(bot: AssistantName) {
  return PERIOD / LIMITS[bot].perHour;
}

/** The person's bucket now: refilled, and with yesterday's strikes cleared. */
export function current(
  bucket: Bucket | null,
  { accountId, bot }: { accountId: string; bot: AssistantName },
  now: number,
): Bucket {
  const { perHour } = LIMITS[bot];
  if (bucket === null) {
    return { accountId, bot, tokens: perHour, updatedAt: now };
  }
  const fresh =
    bucket.strikesSince === undefined || now - bucket.strikesSince >= DAY;
  return {
    accountId,
    bot,
    limited: bucket.limited,
    ...(!fresh && {
      lockNoticeSent: bucket.lockNoticeSent,
      strikes: bucket.strikes,
      strikesSince: bucket.strikesSince,
    }),
    tokens: Math.min(
      perHour,
      bucket.tokens + (now - bucket.updatedAt) / refill(bot),
    ),
    updatedAt: now,
  };
}

export function decide(bucket: Bucket, now: number) {
  const strikes = bucket.strikes ?? 0;
  const lockedUntil = (bucket.strikesSince ?? now) + DAY;
  if (strikes >= STRIKES_PER_DAY) {
    const notice =
      bucket.lockNoticeSent === true
        ? null
        : lockNotice(bucket.bot, lockedUntil - now);
    return { bucket: { ...bucket, lockNoticeSent: true }, notice, ok: false };
  }
  if (bucket.tokens >= 1) {
    return {
      bucket: { ...bucket, limited: undefined, tokens: bucket.tokens - 1 },
      notice: null,
      ok: true,
    };
  }
  // Still in the same stretch at the limit: no new strike, no new notice.
  if (bucket.limited === true) return { bucket, notice: null, ok: false };
  const struck = {
    ...bucket,
    limited: true,
    strikes: strikes + 1,
    strikesSince: bucket.strikesSince ?? now,
  };
  if (struck.strikes >= STRIKES_PER_DAY) {
    return {
      bucket: { ...struck, lockNoticeSent: true },
      notice: lockNotice(bucket.bot, struck.strikesSince + DAY - now),
      ok: false,
    };
  }
  return {
    bucket: struck,
    notice: limitNotice(
      bucket.bot,
      Math.ceil((1 - bucket.tokens) * refill(bucket.bot)),
    ),
    ok: false,
  };
}

function limitNotice(bot: AssistantName, retryAfter: number) {
  const minutes = Math.ceil(retryAfter / 60_000);
  const when =
    minutes <= 1 ? "in a minute" : `in about ${String(minutes)} minutes`;
  return `${LIMIT_NOTICE_START} limit of ${String(LIMITS[bot].perHour)} messages an hour with ${LIMITS[bot].name}. Try again ${when}.`;
}

function lockNotice(bot: AssistantName, retryAfter: number) {
  const hours = Math.max(1, Math.ceil(retryAfter / (60 * 60 * 1000)));
  return `${LIMIT_NOTICE_START} hourly limit too many times today, so ${LIMITS[bot].name} is paused for you. Try again in about ${String(hours)} ${hours === 1 ? "hour" : "hours"}.`;
}

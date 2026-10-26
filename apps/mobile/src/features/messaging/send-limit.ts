import { ConvexError } from "convex/values";

// The PDS's limit on how fast one person sends (send-limits.ts in the
// backend): past it, a send is refused with `RATE_LIMITED` and how long
// until one can go.

/** `value`, typed as unknown, so reading it checks what it is. */
function opaque(value: unknown) {
  return value;
}

/** A field of an error's data, if it's an object, as unknown. */
function fieldOf(data: unknown, key: string) {
  return typeof data === "object" && data !== null
    ? opaque(Reflect.get(data, key))
    : undefined;
}

/**
 * How long to wait before sending again when the PDS refused a send for
 * going over the sender's limit, or undefined for any other failure.
 */
export function retryAfter(error: unknown) {
  if (!(error instanceof ConvexError)) return undefined;
  if (fieldOf(error.data, "code") !== "RATE_LIMITED") return undefined;
  const wait = fieldOf(error.data, "retryAfterMs");
  return typeof wait === "number" ? Math.max(0, wait) : 1000;
}

/**
 * Each account's sends, one after another, so they reach its PDS in the
 * order they were sent, and a refused one holds the rest back until it
 * goes. Only the send itself waits here, not uploads, and a send that
 * hangs holds the rest back no longer than `timeoutMs`.
 */
const sendQueues = new Map<string, Promise<unknown>>();

export function enqueueSend<Result>(
  account: string,
  timeoutMs: number,
  work: () => Promise<Result>,
) {
  const queued = (sendQueues.get(account) ?? Promise.resolve()).then(work);
  const settled = Promise.race([
    queued.catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
  sendQueues.set(account, settled);
  void settled.then(() => {
    if (sendQueues.get(account) === settled) sendQueues.delete(account);
  });
  return queued;
}

/**
 * Runs `attempt`, waiting and trying again while the PDS refuses it for
 * going over the sender's limit (see `retryAfter`), until `giveUpAt`.
 */
export async function sendPatiently<Result>(
  attempt: () => Promise<Result>,
  giveUpAt: number,
) {
  try {
    return await attempt();
  } catch (error) {
    const wait = retryAfter(error);
    if (wait === undefined || Date.now() + wait > giveUpAt) throw error;
    await new Promise((resolve) => setTimeout(resolve, wait));
    return sendPatiently(attempt, giveUpAt);
  }
}

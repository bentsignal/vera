import type { ActionCtx } from "./_generated/server.js";
import { internal } from "./_generated/api.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

/**
 * Each recipient account's badge. A failed count leaves that account's push
 * without a badge rather than holding up the notification.
 */
export async function badgeCounts(
  ctx: ActionCtx,
  recipients: readonly { accountId: string }[],
) {
  const accounts = [...new Set(recipients.map(({ accountId }) => accountId))];
  const counts = await Promise.all(
    accounts.map((accountId) =>
      ctx
        .runQuery(internal.notifications.badge, { accountId })
        .catch((error: unknown) => {
          console.error("Badge count failed", error);
          return undefined;
        }),
    ),
  );
  return new Map(
    accounts.map((accountId, index) => [accountId, counts[index]]),
  );
}

/** iOS sets the app icon badge to the push's `badge`. */
export function badgeField(count: number | undefined) {
  return count === undefined ? {} : { badge: count };
}

/** Posts pushes to Expo in batches and forgets tokens that stopped working. */
export async function deliver(
  ctx: ActionCtx,
  pushes: readonly ({ to: string } & Record<string, unknown>)[],
) {
  for (let start = 0; start < pushes.length; start += EXPO_BATCH_SIZE) {
    const batch = pushes.slice(start, start + EXPO_BATCH_SIZE);
    const response = await fetch(EXPO_PUSH_URL, {
      body: JSON.stringify(batch),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) {
      console.error("Expo push request failed", response.status);
      continue;
    }
    const errors = parseTicketErrors(await response.json());
    const expired = batch
      .filter((_, index) => errors[index] === "DeviceNotRegistered")
      .map(({ to }) => to);
    if (expired.length > 0) {
      await ctx.runMutation(internal.notifications.removeTokens, {
        tokens: expired,
      });
    }
  }
}

/** Each ticket's error code, if any, in request order. */
function parseTicketErrors(body: unknown): (string | undefined)[] {
  if (typeof body !== "object" || body === null || !("data" in body)) return [];
  const { data } = body;
  if (!Array.isArray(data)) return [];
  return data.map((ticket: unknown) => {
    if (typeof ticket !== "object" || ticket === null) return undefined;
    if (!("details" in ticket)) return undefined;
    const { details } = ticket;
    if (typeof details !== "object" || details === null) return undefined;
    return "error" in details && typeof details.error === "string"
      ? details.error
      : undefined;
  });
}

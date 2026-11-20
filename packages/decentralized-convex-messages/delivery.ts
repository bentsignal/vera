import type { Doc } from "./_generated/dataModel.js";
import type { ActionCtx } from "./_generated/server.js";
import type { InboxKind } from "./protocol.ts";
import { internal } from "./_generated/api.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

/**
 * A device a push goes to: whether its app shows threads, and the kinds
 * of rows its Inbox lists if its app badges Home.
 */
interface Recipient {
  readonly accountId: string;
  readonly inbox?: readonly InboxKind[];
  readonly threads?: boolean;
}

/** The device with a push token, as a push's recipient. */
export function recipientOf(row: Doc<"pushTokens">) {
  return {
    accountId: row.accountId,
    inbox: row.inbox,
    threads: row.threads === true,
    token: row.token,
  };
}

/** The kind of app a badge is counted for. */
function appKey({ inbox, threads }: Omit<Recipient, "accountId">) {
  const home = inbox === undefined ? "" : inbox.join(",");
  return `${threads === true ? "threads" : ""} ${home}`;
}

function badgeKey(recipient: Recipient) {
  return `${recipient.accountId} ${appKey(recipient)}`;
}

/**
 * One account's badge for one kind of app. An app with a Home badge
 * builds on the count a push saved moments before (see badgeCache.ts),
 * or counts afresh and saves that.
 */
async function badgeOf(
  ctx: ActionCtx,
  { accountId, inbox, threads }: Recipient,
  messageId: string | undefined,
) {
  const args = {
    accountId,
    inbox: inbox === undefined ? undefined : [...inbox],
    threads: threads === true,
  };
  if (args.inbox === undefined) {
    return (await ctx.runQuery(internal.notifications.badge, args)).count;
  }
  const key = appKey(args);
  const cached = await ctx.runMutation(internal.notifications.cachedBadge, {
    accountId,
    inbox: args.inbox,
    key,
    messageId,
  });
  if ("count" in cached) return cached.count;
  const counted = await ctx.runQuery(internal.notifications.badge, args);
  await ctx.runMutation(internal.notifications.savedBadge, {
    ...cached,
    accountId,
    count: counted.count,
    countedAt: counted.countedAt,
    key,
    rows: counted.rows,
  });
  return counted.count;
}

/**
 * Each recipient's badge, counting threads only for apps that show them,
 * and Home only for apps that badge it. `messageId` is the message a push
 * is about, if it's about one. A failed count leaves that push without a
 * badge rather than holding up the notification.
 */
export async function badgeCounts(
  ctx: ActionCtx,
  recipients: readonly Recipient[],
  messageId?: string,
) {
  const unique = new Map(
    recipients.map((recipient) => [badgeKey(recipient), recipient]),
  );
  const counts = await Promise.all(
    [...unique].map(async ([key, recipient]) => {
      const count = await badgeOf(ctx, recipient, messageId).catch(
        (error: unknown) => {
          console.error("Badge count failed", error);
          return undefined;
        },
      );
      return [key, count] as const;
    }),
  );
  return new Map(counts);
}

/** iOS sets the app icon badge to the push's `badge`. */
export function badgeField(
  badges: ReadonlyMap<string, number | undefined>,
  recipient: Recipient,
) {
  const count = badges.get(badgeKey(recipient));
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

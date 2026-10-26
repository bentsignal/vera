import type { OperationArgs } from "@decentralized-convex/plugin";

import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type {
  AlertLevel,
  messagesProtocol,
  NotificationSettings,
} from "./protocol.ts";
import { fail } from "./model.ts";
import { MAX_KEYWORD_LENGTH, MAX_KEYWORDS } from "./protocol.ts";

type Mutations = (typeof messagesProtocol)["mutations"];
type Args<Operation extends keyof Mutations> = OperationArgs<
  Mutations[Operation]
>;

/**
 * The kinds of pushes an account can turn off on their own. Groups and
 * channels have alert levels instead (see `alertsFor`).
 */
export type PushKind =
  | "directMessages"
  | "invites"
  | "reactions"
  | "replies"
  | "threadReplies";

function settingsRow(ctx: QueryCtx, accountId: string) {
  return ctx.db
    .query("notificationSettings")
    .withIndex("by_account", (index) => index.eq("accountId", accountId))
    .unique();
}

/** A default alert level; rows from before levels have only the switch. */
function defaultAlerts(
  chosen: AlertLevel | undefined,
  on: boolean | undefined,
): AlertLevel {
  return chosen ?? (on === false ? "none" : "all");
}

/** A switch, on until it's turned off. */
function isOn(value: boolean | undefined) {
  return value !== false;
}

/** An account's push settings; everything is on until turned off. */
export async function notificationSettings(
  ctx: QueryCtx,
  accountId: string,
): Promise<
  NotificationSettings &
    Record<"channelAlerts" | "groupAlerts", AlertLevel> & {
      keywords: string[];
    }
> {
  const row: Partial<Doc<"notificationSettings">> =
    (await settingsRow(ctx, accountId)) ?? {};
  const channelAlerts = defaultAlerts(row.channelAlerts, row.channels);
  const groupAlerts = defaultAlerts(row.groupAlerts, row.groups);
  return {
    channelAlerts,
    channels: channelAlerts !== "none",
    directMessages: isOn(row.directMessages),
    enabled: isOn(row.enabled),
    groupAlerts,
    groups: groupAlerts !== "none",
    invites: isOn(row.invites),
    keywords: row.keywords ?? [],
    reactions: isOn(row.reactions),
    replies: isOn(row.replies),
    threadReplies: isOn(row.threadReplies),
    yourName: isOn(row.yourName),
  };
}

export type AccountSettings = Awaited<ReturnType<typeof notificationSettings>>;

/**
 * One kind's default as stored: a level keeps its switch in step for
 * older apps, and a switch from an older app replaces the level.
 */
function defaultPatch(
  level: AlertLevel | undefined,
  on: boolean | undefined,
): { level?: AlertLevel; on?: boolean } | null {
  if (level !== undefined) return { level, on: level !== "none" };
  if (on !== undefined) return { level: undefined, on };
  return null;
}

/**
 * Keywords as stored: trimmed, spaced singly, and each once whatever its
 * case (the first one written wins).
 */
function cleanKeywords(keywords: readonly string[]) {
  const kept = new Map<string, string>();
  for (const written of keywords) {
    const keyword = written.trim().replaceAll(/\s+/g, " ");
    if (keyword.length === 0) continue;
    if (keyword.length > MAX_KEYWORD_LENGTH) fail("KEYWORD_TOO_LONG");
    const key = keyword.toLowerCase();
    if (!kept.has(key)) kept.set(key, keyword);
  }
  if (kept.size > MAX_KEYWORDS) fail("TOO_MANY_KEYWORDS");
  return [...kept.values()];
}

export async function setNotificationSettings(
  ctx: MutationCtx,
  self: string,
  args: Args<"setNotificationSettings">,
) {
  const { channelAlerts, channels, groupAlerts, groups, keywords, ...kinds } =
    args;
  const patch: Partial<Doc<"notificationSettings">> = { ...kinds };
  if (keywords !== undefined) patch.keywords = cleanKeywords(keywords);
  const group = defaultPatch(groupAlerts, groups);
  if (group !== null) {
    patch.groupAlerts = group.level;
    patch.groups = group.on;
  }
  const channel = defaultPatch(channelAlerts, channels);
  if (channel !== null) {
    patch.channelAlerts = channel.level;
    patch.channels = channel.on;
  }
  const row = await settingsRow(ctx, self);
  if (row === null) {
    await ctx.db.insert("notificationSettings", { accountId: self, ...patch });
  } else {
    await ctx.db.patch(row._id, patch);
  }
  return null;
}

/** Whether an account wants this kind of push at all. */
export async function wantsPush(
  ctx: QueryCtx,
  accountId: string,
  kind: PushKind,
) {
  const settings = await notificationSettings(ctx, accountId);
  return settings.enabled && settings[kind];
}

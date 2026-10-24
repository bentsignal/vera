import type { OperationArgs } from "@decentralized-convex/plugin";

import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type {
  AlertLevel,
  messagesProtocol,
  NotificationSettings,
} from "./protocol.ts";

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

/**
 * An account's push settings; everything is on until turned off, except
 * pushes for messages that say their name.
 */
export async function notificationSettings(
  ctx: QueryCtx,
  accountId: string,
): Promise<
  NotificationSettings & Record<"channelAlerts" | "groupAlerts", AlertLevel>
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
    reactions: isOn(row.reactions),
    replies: isOn(row.replies),
    threadReplies: isOn(row.threadReplies),
    yourName: row.yourName === true,
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

export async function setNotificationSettings(
  ctx: MutationCtx,
  self: string,
  args: Args<"setNotificationSettings">,
) {
  const { channelAlerts, channels, groupAlerts, groups, ...kinds } = args;
  const patch: Partial<Doc<"notificationSettings">> = { ...kinds };
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

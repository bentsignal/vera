import type { OperationArgs } from "@decentralized-convex/plugin";

import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { ConversationAccess } from "./model.ts";
import type { AlertLevel, messagesProtocol } from "./protocol.ts";
import type { AccountSettings } from "./settings.ts";
import { chosenAlerts } from "./alertChoice.ts";
import {
  fail,
  findAccess,
  getSpaceMember,
  requireAccess,
  upsertMember,
} from "./model.ts";
import { notificationSettings } from "./settings.ts";

// What each conversation alerts an account about: everything, only
// messages that @mention them, or nothing. A conversation's own choice
// wins, then (for a channel) its space's, then the account's default for
// groups or channels. Direct messages are everything or nothing.

type Mutations = (typeof messagesProtocol)["mutations"];
type Args<Operation extends keyof Mutations> = OperationArgs<
  Mutations[Operation]
>;

type Settings = Pick<AccountSettings, "channelAlerts" | "groupAlerts">;

/** What a conversation alerts about without a choice of its own. */
export function inheritedAlerts(
  access: Pick<ConversationAccess, "conversation" | "spaceAlerts">,
  settings: Settings,
): AlertLevel {
  const { kind } = access.conversation;
  if (kind === "direct") return "all";
  if (kind === "group") return settings.groupAlerts;
  return access.spaceAlerts ?? settings.channelAlerts;
}

/** What a conversation alerts the account it was found for about. */
export function alertsFor(
  access: Pick<ConversationAccess, "alerts" | "conversation" | "spaceAlerts">,
  settings: Settings,
): AlertLevel {
  if (access.conversation.kind === "direct") {
    return access.alerts === "none" ? "none" : "all";
  }
  return access.alerts ?? inheritedAlerts(access, settings);
}

/** What a message says about who it @mentions. */
interface Mentioning {
  readonly mentions?: readonly { accountId: string }[];
  readonly saidTo?: readonly string[];
}

/**
 * Who a message @mentions, or counts as mentioning because it says their
 * name or a keyword (`saidTo`).
 */
export function mentionedBy(message: Mentioning) {
  return [
    ...(message.mentions ?? []).map(({ accountId }) => accountId),
    ...(message.saidTo ?? []),
  ];
}

/**
 * Whether a message alerts an account at this level: anything at `all`,
 * and at `mentions` only a message that @mentions them (see `mentionedBy`).
 */
export function alerts(
  level: AlertLevel,
  message: Mentioning,
  accountId: string,
) {
  if (level === "all") return true;
  return level === "mentions" && mentionedBy(message).includes(accountId);
}

/**
 * What a conversation alerts an account about, or null when they aren't
 * in it.
 */
export async function alertsOf(
  ctx: QueryCtx,
  conversationId: string,
  accountId: string,
) {
  const access = await findAccess(ctx, conversationId, accountId);
  if (access === null) return null;
  return alertsFor(access, await notificationSettings(ctx, accountId));
}

export async function setAlerts(
  ctx: MutationCtx,
  self: string,
  args: Args<"setAlerts">,
) {
  const access = await requireAccess(ctx, args.conversationId, self);
  if (access.conversation.kind === "direct" && args.alerts === "mentions") {
    fail("INVALID_ALERTS");
  }
  const settings = await notificationSettings(ctx, self);
  const before = alertsFor(access, settings);
  // Choosing what it would get anyway follows the space or defaults again.
  const chosen =
    args.alerts === inheritedAlerts(access, settings) ? undefined : args.alerts;
  await upsertMember(ctx, access, self, {
    alerts: chosen,
    muted: chosen === "none",
    // Unmuting starts clean: what came in while muted stays out of activity.
    ...(before === "none" && args.alerts !== "none"
      ? { alertsSince: Date.now() }
      : {}),
  });
  return null;
}

export function setMuted(
  ctx: MutationCtx,
  self: string,
  args: Args<"setMuted">,
) {
  return setAlerts(ctx, self, {
    alerts: args.muted ? "none" : "all",
    conversationId: args.conversationId,
  });
}

export async function setSpaceAlerts(
  ctx: MutationCtx,
  self: string,
  args: Args<"setSpaceAlerts">,
) {
  const member = await getSpaceMember(ctx, args.spaceId, self);
  if (member === null) fail("SPACE_NOT_FOUND");
  const { channelAlerts } = await notificationSettings(ctx, self);
  const before = chosenAlerts(member) ?? channelAlerts;
  const chosen = args.alerts === channelAlerts ? undefined : args.alerts;
  await ctx.db.patch(member._id, {
    alerts: chosen,
    muted: chosen === "none" ? true : undefined,
    ...(before === "none" && args.alerts !== "none"
      ? { alertsSince: Date.now() }
      : {}),
  });
  return null;
}

export function setSpaceMuted(
  ctx: MutationCtx,
  self: string,
  args: Args<"setSpaceMuted">,
) {
  return setSpaceAlerts(ctx, self, {
    alerts: args.muted ? "none" : "all",
    spaceId: args.spaceId,
  });
}

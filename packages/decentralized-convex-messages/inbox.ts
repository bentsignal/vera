import type { OperationArgs } from "@decentralized-convex/plugin";

import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { ConversationAccess } from "./model.ts";
import type { messagesProtocol } from "./protocol.ts";
import type { SpaceReads } from "./spaceReads.ts";
import { alertsFor } from "./alerts.ts";
import { updateOwnEntry } from "./inboxEntries.ts";
import { listedAccess } from "./inboxPages.ts";
import { fail, requireAccess, toConversation, upsertMember } from "./model.ts";
import { LEGACY_INBOX_ROWS } from "./protocol.ts";
import { forgetBadge } from "./pushBadges.ts";
import { notificationSettings } from "./settings.ts";
import { spaceReads } from "./spaceReads.ts";

type Mutations = (typeof messagesProtocol)["mutations"];
type Queries = (typeof messagesProtocol)["queries"];
type Args<Operation extends keyof Mutations> = OperationArgs<
  Mutations[Operation]
>;

export async function setPinned(
  ctx: MutationCtx,
  self: string,
  args: Args<"setPinned">,
) {
  const access = await requireAccess(ctx, args.conversationId, self);
  if (args.pinned === (access.member?.pinnedAt !== undefined)) return null;
  const pinnedAt = args.pinned ? Date.now() : undefined;
  await upsertMember(ctx, access, self, { pinnedAt });
  await updateOwnEntry(ctx, self, access.conversation, {
    pinnedAt: pinnedAt ?? null,
  });
  return null;
}

export async function setShowInInbox(
  ctx: MutationCtx,
  self: string,
  args: Args<"setShowInInbox">,
) {
  await forgetBadge(ctx, self);
  const access = await requireAccess(ctx, args.conversationId, self);
  if (access.conversation.kind !== "channel") fail("CHANNEL_REQUIRED");
  await upsertMember(ctx, access, self, {
    hiddenFromInbox: args.show ? undefined : true,
  });
  await updateOwnEntry(ctx, self, access.conversation, {
    section: args.show ? "channels" : "hidden",
  });
  return null;
}

/**
 * The caller's inbox for apps from before pages: its pins and newest
 * `LEGACY_INBOX_ROWS` rows (see `listedAccess`), newest first.
 */
export async function inbox(
  ctx: QueryCtx,
  self: string,
  args: OperationArgs<Queries["inbox"]>,
) {
  const spaces = spaceReads(ctx);
  const conversations = await inboxRows(
    ctx,
    self,
    await listedAccess(
      ctx,
      self,
      { channels: args.channels === true, limit: LEGACY_INBOX_ROWS },
      spaces,
    ),
    spaces,
  );
  return conversations.sort((left, right) => right.updatedAt - left.updatedAt);
}

/** The inbox's rows, each as `conversation` answers it. */
export async function inboxRows(
  ctx: QueryCtx,
  self: string,
  accesses: readonly ConversationAccess[],
  spaces: SpaceReads,
) {
  const settings = await notificationSettings(ctx, self);
  return Promise.all(
    accesses.map((access) =>
      toConversation(ctx, access, self, alertsFor(access, settings), spaces),
    ),
  );
}

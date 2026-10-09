import type { OperationArgs } from "@decentralized-convex/plugin";

import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { ConversationAccess } from "./model.ts";
import type { messagesProtocol } from "./protocol.ts";
import {
  fail,
  findAccess,
  requireAccess,
  toConversation,
  upsertMember,
} from "./model.ts";

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
  await upsertMember(ctx, access, self, {
    pinnedAt: args.pinned ? Date.now() : undefined,
  });
  return null;
}

export async function setShowInInbox(
  ctx: MutationCtx,
  self: string,
  args: Args<"setShowInInbox">,
) {
  const access = await requireAccess(ctx, args.conversationId, self);
  if (access.conversation.kind !== "channel") fail("CHANNEL_REQUIRED");
  await upsertMember(ctx, access, self, {
    hiddenFromInbox: args.show ? undefined : true,
  });
  return null;
}

/**
 * Direct messages and groups, plus (with `channels`) the channels of the
 * caller's spaces that they haven't left out of the inbox. Channels have
 * member rows only once read, so they come from space membership instead.
 */
export async function inboxAccess(
  ctx: QueryCtx,
  self: string,
  channels: boolean,
) {
  // Every conversation is read concurrently; reading them one at a time made
  // a large inbox take a second, and every write to it waits for that.
  const memberships = await ctx.db
    .query("members")
    .withIndex("by_account", (index) => index.eq("accountId", self))
    .collect();
  const direct = await Promise.all(
    memberships.map((membership) =>
      findAccess(ctx, membership.conversationId, self),
    ),
  );
  const found = direct.filter(
    (access): access is ConversationAccess =>
      access !== null && access.conversation.kind !== "channel",
  );
  if (!channels) return found;
  const spaces = await ctx.db
    .query("spaceMembers")
    .withIndex("by_account", (index) => index.eq("accountId", self))
    .collect();
  const spaceChannels = await Promise.all(
    spaces.map(async ({ spaceId }) => {
      const conversations = await ctx.db
        .query("conversations")
        .withIndex("by_space", (index) => index.eq("spaceId", spaceId))
        .collect();
      return Promise.all(
        conversations.map((channel) =>
          findAccess(ctx, channel.conversationId, self),
        ),
      );
    }),
  );
  for (const access of spaceChannels.flat()) {
    if (access === null || access.member?.hiddenFromInbox === true) continue;
    found.push(access);
  }
  return found;
}

/** The caller's inbox (see `inboxAccess`), newest first. */
export async function inbox(
  ctx: QueryCtx,
  self: string,
  args: OperationArgs<Queries["inbox"]>,
) {
  const conversations = await Promise.all(
    (await inboxAccess(ctx, self, args.channels === true)).map((access) =>
      toConversation(ctx, access, self),
    ),
  );
  return conversations.sort((left, right) => right.updatedAt - left.updatedAt);
}

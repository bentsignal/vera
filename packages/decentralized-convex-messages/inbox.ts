import type { OperationArgs } from "@decentralized-convex/plugin";

import type { MutationCtx, QueryCtx } from "./_generated/server.js";
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
export async function inbox(
  ctx: QueryCtx,
  self: string,
  args: OperationArgs<Queries["inbox"]>,
) {
  const memberships = await ctx.db
    .query("members")
    .withIndex("by_account", (index) => index.eq("accountId", self))
    .collect();
  const conversations = [];
  for (const membership of memberships) {
    const access = await findAccess(ctx, membership.conversationId, self);
    if (access === null || access.conversation.kind === "channel") continue;
    conversations.push(await toConversation(ctx, access, self));
  }
  if (args.channels === true) {
    const spaces = await ctx.db
      .query("spaceMembers")
      .withIndex("by_account", (index) => index.eq("accountId", self))
      .collect();
    for (const { spaceId } of spaces) {
      const channels = await ctx.db
        .query("conversations")
        .withIndex("by_space", (index) => index.eq("spaceId", spaceId))
        .collect();
      for (const channel of channels) {
        const access = await findAccess(ctx, channel.conversationId, self);
        if (access === null || access.member?.hiddenFromInbox === true) {
          continue;
        }
        conversations.push(await toConversation(ctx, access, self));
      }
    }
  }
  return conversations.sort((left, right) => right.updatedAt - left.updatedAt);
}

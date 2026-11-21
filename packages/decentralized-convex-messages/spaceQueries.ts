import type { Doc } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
import type { Space } from "./protocol.ts";
import { chosenAlerts } from "./alertChoice.ts";
import { unreadCount } from "./chatMessages.ts";
import { getMember, getSpace, getSpaceMember } from "./model.ts";
import {
  MAX_SPACES_LISTED,
  SPACE_PAGE_SIZE,
  SPACE_PREVIEW_SIZE,
} from "./protocol.ts";
import { readAt } from "./readStates.ts";
import { notificationSettings } from "./settings.ts";

// Reading spaces: each lists a first page of its members and channels,
// and the rest load a page at a time, since spaces have no limit on
// either.

export async function spaces(ctx: QueryCtx, self: string) {
  const memberships = await ctx.db
    .query("spaceMembers")
    .withIndex("by_account", (index) => index.eq("accountId", self))
    .take(MAX_SPACES_LISTED);
  const found = await Promise.all(
    memberships.map(async ({ spaceId }) => {
      const space = await getSpace(ctx, spaceId);
      return space === null
        ? null
        : toSpace(ctx, space, self, SPACE_PREVIEW_SIZE);
    }),
  );
  return found
    .filter((space) => space !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function space(ctx: QueryCtx, self: string, spaceId: string) {
  const found = await getSpace(ctx, spaceId);
  return found === null ? null : toSpace(ctx, found, self);
}

/** One of a space's channels, as the caller has it. */
async function channelRow(
  ctx: QueryCtx,
  conversation: Doc<"conversations">,
  self: Doc<"spaceMembers">,
) {
  const { accountId } = self;
  const member = await getMember(ctx, conversation.conversationId, accountId);
  const chosen = chosenAlerts(member);
  return {
    alerts: chosen,
    conversationId: conversation.conversationId,
    muted: chosen === "none",
    name: conversation.name ?? "",
    position: conversation.position ?? 0,
    showInInbox: member?.hiddenFromInbox !== true,
    unreadCount: await unreadCount(
      ctx,
      conversation.conversationId,
      accountId,
      await readAt(
        ctx,
        conversation.conversationId,
        accountId,
        member?.lastReadAt ?? self._creationTime,
      ),
    ),
  };
}

/**
 * A page of a space's channels by position, after `after`: `size`, plus
 * any at the same position as the last, and whether there are more.
 */
async function channelPage(
  ctx: QueryCtx,
  self: Doc<"spaceMembers">,
  after: number | undefined,
  size: number,
) {
  const found = await ctx.db
    .query("conversations")
    .withIndex("by_space_position", (index) => {
      const scoped = index.eq("spaceId", self.spaceId);
      return after === undefined ? scoped : scoped.gt("position", after);
    })
    .take(size * 2 + 1);
  const last = found[size - 1];
  let end = Math.min(size, found.length);
  while (
    last !== undefined &&
    end < size * 2 &&
    found[end]?.position === last.position
  ) {
    end += 1;
  }
  const page = found.slice(0, end);
  const channels = await Promise.all(
    page.map((conversation) => channelRow(ctx, conversation, self)),
  );
  channels.sort(
    (left, right) =>
      left.position - right.position || left.name.localeCompare(right.name),
  );
  const more = found.length > end;
  // Positions start at 0; one without (from before positions) counts as -1.
  return {
    channels,
    next: more ? (page.at(-1)?.position ?? -1) : null,
  };
}

/** A page of a space's members by address, after `after`. */
async function memberPage(
  ctx: QueryCtx,
  spaceId: string,
  after: string | undefined,
  size: number,
) {
  const found = await ctx.db
    .query("spaceMembers")
    .withIndex("by_space_account", (index) => {
      const scoped = index.eq("spaceId", spaceId);
      return after === undefined ? scoped : scoped.gt("accountId", after);
    })
    .take(size + 1);
  const members = found
    .slice(0, size)
    .map(({ accountId, role }) => ({ accountId, role }));
  return {
    members,
    next: found.length > size ? (members.at(-1)?.accountId ?? null) : null,
  };
}

/** The next page of a space's members (see `spaceMembers`). */
export async function spaceMembers(
  ctx: QueryCtx,
  self: string,
  args: { after?: string; spaceId: string },
) {
  if ((await getSpaceMember(ctx, args.spaceId, self)) === null) return null;
  return memberPage(ctx, args.spaceId, args.after, SPACE_PAGE_SIZE);
}

/** The next page of a space's channels (see `spaceChannels`). */
export async function spaceChannels(
  ctx: QueryCtx,
  self: string,
  args: { after?: number; spaceId: string },
) {
  const member = await getSpaceMember(ctx, args.spaceId, self);
  if (member === null) return null;
  return channelPage(ctx, member, args.after, SPACE_PAGE_SIZE);
}

/**
 * A space as the caller has it, with the first `size` of its members,
 * channels, and invited people (see `space` in the protocol).
 */
export async function toSpace(
  ctx: QueryCtx,
  space: Doc<"spaces">,
  accountId: string,
  size = SPACE_PAGE_SIZE,
): Promise<Space | null> {
  const self = await getSpaceMember(ctx, space.spaceId, accountId);
  if (self === null) return null;
  const [members, invites, channels, settings] = await Promise.all([
    memberPage(ctx, space.spaceId, undefined, size),
    ctx.db
      .query("spaceInvites")
      .withIndex("by_space_account", (index) =>
        index.eq("spaceId", space.spaceId),
      )
      .take(size + 1),
    channelPage(ctx, self, undefined, size),
    notificationSettings(ctx, accountId),
  ]);
  const alerts = chosenAlerts(self) ?? settings.channelAlerts;
  return {
    alerts,
    channels: channels.channels,
    invited: invites.slice(0, size).map((invite) => invite.accountId),
    joinedAt: self._creationTime,
    members: members.members,
    ...(channels.next === null ? {} : { moreChannels: true }),
    ...(invites.length > size ? { moreInvited: true } : {}),
    ...(members.next === null ? {} : { moreMembers: true }),
    muted: alerts === "none",
    name: space.name,
    role: self.role,
    spaceId: space.spaceId,
    // Of the channels it lists.
    unreadCount: channels.channels.reduce(
      (total, channel) => total + channel.unreadCount,
      0,
    ),
  };
}

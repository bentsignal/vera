import type { Doc } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
import type { ConversationAccess } from "./model.ts";
import type { ActivityConversation, AlertLevel } from "./protocol.ts";
import type { AccountSettings } from "./settings.ts";
import type { SpaceReads } from "./spaceReads.ts";
import { alerts } from "./alerts.ts";
import { findAccess, memberAddresses } from "./model.ts";
import { ACTIVITY_SEEN_LIFETIME } from "./protocol.ts";
import { sightingsOf } from "./sightings.ts";

// What `activity` works from, shared by each kind of item.

/**
 * An item's newest sighting, and the newest activity in it that was seen
 * over a day ago (`goneThrough`), which no longer shows.
 */
export async function seenState(
  ctx: QueryCtx,
  accountId: string,
  key: string,
  now: number,
) {
  const rows = await sightingsOf(ctx, accountId, key);
  let goneThrough = 0;
  for (const row of rows) {
    if (row.seenAt <= now - ACTIVITY_SEEN_LIFETIME) {
      goneThrough = Math.max(goneThrough, row.through);
    }
  }
  const latest = rows.at(-1);
  return {
    goneThrough,
    seen:
      latest === undefined
        ? {}
        : { seenAt: latest.seenAt, seenThrough: latest.through },
  };
}

/** Describes each conversation once, however many items it has. */
export function conversationDescriber(ctx: QueryCtx, spaces: SpaceReads) {
  const described = new Map<string, Promise<ActivityConversation>>();
  async function describe(conversation: Doc<"conversations">) {
    const { spaceId } = conversation;
    const [members, space] = await Promise.all([
      memberAddresses(ctx, conversation, spaces),
      spaceId === undefined ? null : spaces.space(spaceId),
    ]);
    return {
      conversationId: conversation.conversationId,
      kind: conversation.kind,
      members,
      name: conversation.name ?? null,
      spaceId: conversation.spaceId ?? null,
      spaceName: space?.name,
    };
  }
  return (conversation: Doc<"conversations">) => {
    const known = described.get(conversation.conversationId);
    if (known !== undefined) return known;
    const found = describe(conversation);
    described.set(conversation.conversationId, found);
    return found;
  };
}

/** Finds the caller's access to each conversation once. */
export function accessFinder(ctx: QueryCtx, self: string, spaces: SpaceReads) {
  const access = new Map<string, Promise<ConversationAccess | null>>();
  return (conversationId: string) => {
    const known = access.get(conversationId);
    if (known !== undefined) return known;
    const found = findAccess(ctx, conversationId, self, spaces);
    access.set(conversationId, found);
    return found;
  };
}

/** What one call of `activity` works from. */
export interface Scope {
  /** Whether only what's about the caller shows (see `activity`). */
  readonly aboutYou: boolean;
  readonly accessTo: ReturnType<typeof accessFinder>;
  readonly describe: ReturnType<typeof conversationDescriber>;
  /** Whether mentions are their own items (see `activity`). */
  readonly mentions: boolean;
  readonly now: number;
  readonly self: string;
  readonly settings: AccountSettings;
  /** Spaces' rows, read once for all their channels. */
  readonly spaces: SpaceReads;
  /** Whether threads have items (see `activity`). */
  readonly threads: boolean;
}

/**
 * Whether a conversation's activity shows at all: it alerts about
 * something, and a channel is still in the inbox.
 */
export function isHeard(access: ConversationAccess, level: AlertLevel) {
  return level !== "none" && access.member?.hiddenFromInbox !== true;
}

/**
 * Whether a message is left out of its conversation's or thread's item:
 * with mentions as their own items, one that mentions the caller is.
 */
export function leftForMention(scope: Scope, message: Doc<"messages">) {
  return scope.mentions && alerts("mentions", message, scope.self);
}

export function messageById(ctx: QueryCtx, messageId: string) {
  return ctx.db
    .query("messages")
    .withIndex("by_message", (index) => index.eq("messageId", messageId))
    .unique();
}

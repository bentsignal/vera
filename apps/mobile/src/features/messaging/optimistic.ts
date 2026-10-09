import type {
  Conversation,
  CreatedKind,
  Space,
  SpaceInvite,
} from "@decentralized-convex/messages";
import type { PdsOptimisticLocalStore } from "@decentralized-convex/tanstack-query";
import * as Crypto from "expo-crypto";
import {
  channelName,
  createdId,
  directConversationId,
} from "@decentralized-convex/messages";
import { pds } from "@vera/backend/pds";

// Optimistic updates: what each action changes in the home PDS's query
// results the moment it starts, until the PDS's own result arrives (or rolls
// back if it fails). See `pdsMutation`'s `optimisticUpdate`.

type Store = PdsOptimisticLocalStore;

/**
 * When each optimistic action first ran. Updates run again as results
 * arrive, and must give the same result every time.
 */
const startedAt = new WeakMap<object, number>();

function startTime(args: object) {
  const known = startedAt.get(args);
  if (known !== undefined) return known;
  const now = Date.now();
  startedAt.set(args, now);
  return now;
}

function newConversation(
  fields: Pick<Conversation, "conversationId" | "kind" | "members"> &
    Partial<Conversation>,
  args: object,
) {
  return {
    lastMessage: null,
    muted: false,
    name: null,
    spaceId: null,
    unreadCount: 0,
    updatedAt: startTime(args),
    ...fields,
  } satisfies Conversation;
}

/** Lists a new conversation in every loaded inbox that shows its kind. */
function addToInboxes(store: Store, conversation: Conversation) {
  const { conversationId, kind } = conversation;
  for (const { args, request, value } of store.getAllQueries(
    pds.messages.inbox,
  )) {
    if (value === undefined || (kind === "channel" && args.channels !== true)) {
      continue;
    }
    if (value.some((item) => item.conversationId === conversationId)) continue;
    store.setQuery(request, [conversation, ...value]);
  }
}

/**
 * Shows a new conversation in the inbox and as open-able and empty, until
 * the PDS has it.
 */
function showConversation(store: Store, conversation: Conversation) {
  const { conversationId } = conversation;
  addToInboxes(store, conversation);
  const request = pds.messages.conversation({ conversationId });
  if (store.getQuery(request) == null) store.setQuery(request, conversation);
  for (const { args, request: page, value } of store.getAllQueries(
    pds.messages.list,
  )) {
    if (args.conversationId !== conversationId || value !== undefined) {
      continue;
    }
    store.setQuery(page, { hasNewer: false, hasOlder: false, messages: [] });
  }
}

function findSpace(store: Store, spaceId: string) {
  const space = store.getQuery(pds.messages.space({ spaceId }));
  if (space != null) return space;
  return store
    .getAllQueries(pds.messages.spaces)
    .flatMap(({ value }) => value ?? [])
    .find((item) => item.spaceId === spaceId);
}

/** Changes a space wherever it's loaded: on its own and in lists. */
function updateSpace(
  store: Store,
  spaceId: string,
  change: (space: Space) => Space,
) {
  const request = pds.messages.space({ spaceId });
  const space = store.getQuery(request);
  if (space != null) store.setQuery(request, change(space));
  for (const { request: list, value } of store.getAllQueries(
    pds.messages.spaces,
  )) {
    if (value === undefined) continue;
    store.setQuery(
      list,
      value.map((item) => (item.spaceId === spaceId ? change(item) : item)),
    );
  }
}

function withoutInvite(store: Store, spaceId: string) {
  for (const { request, value } of store.getAllQueries(
    pds.messages.spaceInvites,
  )) {
    if (value === undefined) continue;
    store.setQuery(
      request,
      value.filter((invite: SpaceInvite) => invite.spaceId !== spaceId),
    );
  }
}

/** A new group, open straight away with the ID the app made. */
export function createGroup(self: string) {
  return (
    store: Store,
    args: { conversationId?: string; members: string[]; name?: string },
  ) => {
    if (args.conversationId === undefined) return;
    const others = args.members.filter((member) => member !== self);
    showConversation(
      store,
      newConversation(
        {
          conversationId: args.conversationId,
          kind: "group",
          members: [self, ...others],
          name: args.name ?? null,
        },
        args,
      ),
    );
  };
}

/** The direct conversation with someone, open straight away. */
export function openDirect(self: string) {
  return (store: Store, args: { accountId: string }) => {
    const other = args.accountId.trim().toLowerCase();
    showConversation(
      store,
      newConversation(
        {
          conversationId: directConversationId(self, other),
          kind: "direct",
          members: [self, other],
        },
        args,
      ),
    );
  };
}

/** A new channel, listed in its space and the inbox straight away. */
export function createChannel(self: string) {
  return (
    store: Store,
    args: { conversationId?: string; name: string; spaceId: string },
  ) => {
    const { conversationId, spaceId } = args;
    if (conversationId === undefined) return;
    const space = findSpace(store, spaceId);
    const channels = space?.channels ?? [];
    const channel = {
      conversationId,
      name: channelName(args.name),
      position: Math.max(-1, ...channels.map(({ position }) => position)) + 1,
      showInInbox: true,
      unreadCount: 0,
    };
    updateSpace(store, spaceId, (current) =>
      current.channels.some((item) => item.conversationId === conversationId)
        ? current
        : { ...current, channels: [...current.channels, channel] },
    );
    showConversation(
      store,
      newConversation(
        {
          conversationId,
          kind: "channel",
          members: space?.members.map(({ accountId }) => accountId) ?? [self],
          name: channel.name,
          showInInbox: true,
          spaceId,
          ...(space === undefined ? {} : { spaceName: space.name }),
        },
        args,
      ),
    );
  };
}

/** A new space with its #general, open straight away. */
export function createSpace(self: string) {
  return (
    store: Store,
    args: { generalChannelId?: string; name: string; spaceId?: string },
  ) => {
    const { generalChannelId, spaceId } = args;
    if (spaceId === undefined || generalChannelId === undefined) return;
    const name = args.name.trim();
    const space = {
      channels: [
        {
          conversationId: generalChannelId,
          name: "general",
          position: 0,
          showInInbox: true,
          unreadCount: 0,
        },
      ],
      invited: [],
      members: [{ accountId: self, role: "owner" }],
      name,
      role: "owner",
      spaceId,
      unreadCount: 0,
    } satisfies Space;
    for (const { request, value } of store.getAllQueries(pds.messages.spaces)) {
      if (value === undefined || value.some((item) => item.spaceId === spaceId))
        continue;
      store.setQuery(
        request,
        [...value, space].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      );
    }
    const request = pds.messages.space({ spaceId });
    if (store.getQuery(request) == null) store.setQuery(request, space);
    const links = pds.messages.spaceInviteLinks({ spaceId });
    if (store.getQuery(links) === undefined) store.setQuery(links, []);
    showConversation(
      store,
      newConversation(
        {
          conversationId: generalChannelId,
          kind: "channel",
          members: [self],
          name: "general",
          showInInbox: true,
          spaceId,
          spaceName: name,
        },
        args,
      ),
    );
  };
}

/** People invited to a space show as invited straight away. */
export function inviteToSpace(
  store: Store,
  args: { members: string[]; spaceId: string },
) {
  updateSpace(store, args.spaceId, (space) => {
    const members = new Set(space.members.map(({ accountId }) => accountId));
    const invited = space.invited ?? [];
    const added = args.members.filter(
      (member) => !members.has(member) && !invited.includes(member),
    );
    return added.length === 0
      ? space
      : { ...space, invited: [...invited, ...added] };
  });
}

/**
 * Joining a space: its invitation goes away, and the space shows as loading
 * (not "not found") until the PDS has added you.
 */
export function joinSpace(store: Store, args: { spaceId: string }) {
  withoutInvite(store, args.spaceId);
  const request = pds.messages.space({ spaceId: args.spaceId });
  if (store.getQuery(request) == null) store.setQuery(request, undefined);
}

/** Joining with a link to the space its preview showed. */
export function joinSpaceWithLink(store: Store, args: { code: string }) {
  const preview = store.getQuery(pds.messages.spaceInviteLinkPreview(args));
  if (preview != null) joinSpace(store, { spaceId: preview.spaceId });
}

export function declineInvite(store: Store, args: { spaceId: string }) {
  withoutInvite(store, args.spaceId);
}

/** Leaving drops the space and its channels; removing someone drops them. */
export function removeSpaceMember(self: string) {
  return (store: Store, args: { accountId: string; spaceId: string }) => {
    const { accountId, spaceId } = args;
    if (accountId !== self) {
      updateSpace(store, spaceId, (space) => ({
        ...space,
        members: space.members.filter(
          (member) => member.accountId !== accountId,
        ),
      }));
      return;
    }
    for (const { request, value } of store.getAllQueries(pds.messages.spaces)) {
      if (value === undefined) continue;
      store.setQuery(
        request,
        value.filter((space) => space.spaceId !== spaceId),
      );
    }
    for (const { request, value } of store.getAllQueries(pds.messages.inbox)) {
      if (value === undefined) continue;
      store.setQuery(
        request,
        value.filter((conversation) => conversation.spaceId !== spaceId),
      );
    }
  };
}

/**
 * An ID for a new group, space, or channel, made here so the app can show
 * and open it before the PDS answers.
 */
export function newId(kind: CreatedKind, account: string) {
  return createdId(kind, account, Crypto.randomUUID());
}

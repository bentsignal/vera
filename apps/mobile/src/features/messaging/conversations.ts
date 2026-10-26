import type {
  Conversation,
  Message as PdsMessage,
} from "@decentralized-convex/messages";
import type { PdsOptimisticLocalStore } from "@decentralized-convex/tanstack-query";
import { useState } from "react";
// eslint-disable-next-line no-restricted-imports -- Expo Router has no route loaders to preload suspense queries.
import { useMutation, useQuery } from "@tanstack/react-query";
import { listNames } from "@decentralized-convex/messages";
import { pdsMutation, pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import type { ReactionSummary } from "./reactions";
import type { Message, MessageAttachment } from "~/features/conversation/types";
import { useAccount } from "./account";
import { directConversation } from "./direct";
import * as optimistic from "./optimistic";
import { useProfileState } from "./profiles";
import { pdsResult } from "./results";

export function toMessage(
  message: PdsMessage,
  reactions: readonly ReactionSummary[] | undefined,
  attachments: readonly MessageAttachment[] = message.attachments,
) {
  return {
    attachments,
    authorId: message.authorId,
    body: message.body.length > 0 ? message.body : undefined,
    deleted: message.deletedAt === undefined ? undefined : true,
    editedAt:
      message.editedAt === undefined ? undefined : new Date(message.editedAt),
    id: message.messageId,
    linkPreview: message.linkPreview ?? undefined,
    linkPreviews: message.linkPreviews,
    mentions: message.mentions,
    // A deleted message's reactions went with it (others' PDSs may still
    // have some).
    reactions:
      message.deletedAt === undefined || reactions === undefined
        ? reactions
        : [],
    quote: message.quote,
    sentAt: new Date(message.sentAt),
    threadId: message.threadId,
  } satisfies Message;
}

/**
 * A group's title: its name, or else the other members' names, in address
 * order like the PDS lists them (so it reads the same everywhere).
 */
export function groupTitle(
  name: string | null,
  members: readonly string[],
  self: string,
  displayName: (id: string) => string,
) {
  if (name !== null) return name;
  const others = members.filter((member) => member !== self).sort();
  return others.length === 0 ? "Group" : listNames(others.map(displayName));
}

export function conversationTitle(
  conversation: Pick<Conversation, "kind" | "members" | "name">,
  self: string,
  displayName: (id: string) => string,
) {
  const { kind, members, name } = conversation;
  if (kind === "channel") return `#${name ?? ""}`;
  if (kind === "group") return groupTitle(name, members, self, displayName);
  const other = members.find((member) => member !== self);
  return displayName(other ?? self);
}

/**
 * Its title once every name in it is known, or "" until then. A direct
 * conversation's title is the other person's name, and an unnamed group's
 * is its members' names: they wait, rather than show usernames that then
 * change.
 */
function settledTitle(
  conversation:
    | Pick<Conversation, "kind" | "members" | "name">
    | null
    | undefined,
  namesLoaded: boolean,
  self: string,
  displayName: (id: string) => string,
) {
  if (conversation == null) return "";
  const { kind, name } = conversation;
  const ofNames = kind === "direct" || (kind === "group" && name === null);
  return ofNames && !namesLoaded
    ? ""
    : conversationTitle(conversation, self, displayName);
}

/** What `useConversation` reads of the messages a screen shows. */
interface ShownMessage {
  readonly authorId: string;
  readonly quote?: { readonly authorId: string };
  readonly thread?: { readonly repliers: readonly string[] };
}

/**
 * Who a list of messages shows: their authors, the authors of what replies
 * quote, and who replied in their threads.
 */
function peopleShown(messages: readonly ShownMessage[]) {
  return messages.flatMap(({ authorId, quote, thread }) => [
    authorId,
    ...(quote === undefined ? [] : [quote.authorId]),
    ...(thread?.repliers ?? []),
  ]);
}

/**
 * Whether a screen's names and photos are in. Once they are, it stays
 * that way: someone new writing doesn't take the screen back to loading
 * while their name loads.
 */
function useProfilesSettled(loaded: boolean, profilesIn: boolean) {
  const ready = loaded && profilesIn;
  const [settled, setSettled] = useState(false);
  if (ready && !settled) setSettled(true);
  return settled || ready;
}

/**
 * A conversation, and the profiles of its members and of the people its
 * `messages` show (see `peopleShown`).
 */
/**
 * The members whose names a conversation loads with it: a direct
 * conversation's and a group's. A channel's are everyone in its space;
 * their names load once someone starts typing, for @mentions (see
 * `useMentionNames`).
 */
function membersShown(
  conversation: Pick<Conversation, "kind" | "members"> | null | undefined,
) {
  return conversation == null || conversation.kind === "channel"
    ? []
    : conversation.members;
}

export function useConversation(
  conversationId: string,
  messages: readonly ShownMessage[] = [],
) {
  const shown = peopleShown(messages);
  const { address } = useAccount();
  const { data } = useQuery(
    pdsQuery({
      args: { conversationId },
      options: { select: (result) => pdsResult(result)?.[0] },
      query: pds.messages.conversation,
      session: address,
    }),
  );
  const known = data === undefined ? directConversation(conversationId) : data;
  const members = known?.members ?? [];
  const { isLoaded, profileOf } = useProfileState([
    ...membersShown(known),
    ...shown,
  ]);
  function displayName(account: string) {
    return profileOf(account).displayName;
  }
  const profilesLoaded = useProfilesSettled(
    data != null,
    // A channel waits only for the people its messages show.
    (known?.kind === "channel" ? shown : [...members, ...shown]).every(
      isLoaded,
    ),
  );
  return {
    conversation: data ?? undefined,
    displayName,
    isLoading: data === undefined,
    /** Its kind, known before it loads for a direct conversation. */
    kind: known?.kind,
    /** Its members, known before it loads for a direct conversation. */
    members,
    /**
     * The names and photos it shows are known, so they won't change: its
     * members' (a channel's are too many), and those `messages` show.
     */
    profilesLoaded,
    profileOf,
    /** Empty until every name it's made of is known, so it never changes. */
    title: settledTitle(known, members.every(isLoaded), address, displayName),
  };
}

/**
 * People added to a group show as members straight away, in address order
 * like the PDS lists them.
 */
function addGroupMembers(
  store: PdsOptimisticLocalStore,
  args: { conversationId: string; members: string[] },
) {
  const { conversationId } = args;
  function withAdded(conversation: Conversation) {
    const members = new Set([
      ...conversation.members,
      ...args.members.map((member) => member.trim().toLowerCase()),
    ]);
    return members.size === conversation.members.length
      ? conversation
      : { ...conversation, members: [...members].sort() };
  }
  const request = pds.messages.conversation({ conversationId });
  const conversation = store.getQuery(request);
  if (conversation != null) store.setQuery(request, withAdded(conversation));
  for (const { request: inbox, value } of store.getAllQueries(
    pds.messages.inbox,
  )) {
    if (value === undefined) continue;
    store.setQuery(
      inbox,
      value.map((item) =>
        item.conversationId === conversationId ? withAdded(item) : item,
      ),
    );
  }
}

/**
 * Starting a group or a direct conversation, or adding people to a group,
 * as the scoped account. Each shows right away, before the PDS answers.
 */
export function useConversationActions() {
  const { address: session } = useAccount();
  return {
    addGroupMembers: useMutation(
      pdsMutation({
        mutation: pds.messages.addGroupMembers,
        optimisticUpdate: addGroupMembers,
        session,
      }),
    ),
    createGroup: useMutation(
      pdsMutation({
        mutation: pds.messages.createGroup,
        optimisticUpdate: optimistic.createGroup(session),
        session,
      }),
    ),
    openDirect: useMutation(
      pdsMutation({
        mutation: pds.messages.openDirect,
        optimisticUpdate: optimistic.openDirect(session),
        session,
      }),
    ),
  };
}

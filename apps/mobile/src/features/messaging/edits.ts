import type {
  Mention,
  Message as PdsMessage,
  Quote,
} from "@decentralized-convex/messages";
import type { PdsOptimisticLocalStore } from "@decentralized-convex/tanstack-query";
import { Alert } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { previewedUrls } from "@decentralized-convex/messages";
import { pdsMutation } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { useAccount } from "./account";
import { deleteOutgoing } from "./outbox";

// Editing and deleting your own messages. Both show the moment they start:
// your messages live on your home PDS, so its loaded results are changed
// in place until its own arrive (see `pdsMutation`'s `optimisticUpdate`).

type Store = PdsOptimisticLocalStore;

/**
 * When each optimistic change first ran. Updates run again as results
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

interface Change {
  readonly conversationId: string;
  readonly messageId: string;
  /** The message as it now is. */
  readonly message: (message: PdsMessage) => PdsMessage;
  /** A reply's quote of it as it now is. */
  readonly quote: (quote: Quote) => Quote;
}

/**
 * The message changed, or a reply with its quote changed; anything else
 * stays the same object, so its row doesn't redraw.
 */
function changed(message: PdsMessage, change: Change) {
  if (message.messageId === change.messageId) return change.message(message);
  if (message.quote?.messageId !== change.messageId) return message;
  return { ...message, quote: change.quote(message.quote) };
}

/** Changes the message wherever the conversation's pages and threads hold it. */
function changePages(store: Store, change: Change) {
  for (const { args, request, value } of store.getAllQueries(
    pds.messages.list,
  )) {
    if (value === undefined || args.conversationId !== change.conversationId) {
      continue;
    }
    store.setQuery(request, {
      ...value,
      messages: value.messages.map((message) => changed(message, change)),
    });
  }
  for (const { args, request, value } of store.getAllQueries(
    pds.messages.thread,
  )) {
    if (value === undefined || args.conversationId !== change.conversationId) {
      continue;
    }
    store.setQuery(request, {
      ...value,
      messages: value.messages.map((message) => changed(message, change)),
      root: value.root === null ? null : changed(value.root, change),
    });
  }
}

/**
 * Sets the conversation's last message in the inbox and on its own, where
 * it's `messageId`.
 */
function changeLastMessage(
  store: Store,
  { conversationId, messageId }: Change,
  last: (message: PdsMessage) => PdsMessage | null,
) {
  const request = pds.messages.conversation({ conversationId });
  const conversation = store.getQuery(request);
  if (conversation?.lastMessage?.messageId === messageId) {
    store.setQuery(request, {
      ...conversation,
      lastMessage: last(conversation.lastMessage),
    });
  }
  for (const { request: inbox, value } of store.getAllQueries(
    pds.messages.inbox,
  )) {
    if (value === undefined) continue;
    store.setQuery(
      inbox,
      value.map((item) =>
        item.conversationId === conversationId &&
        item.lastMessage?.messageId === messageId
          ? { ...item, lastMessage: last(item.lastMessage) }
          : item,
      ),
    );
  }
}

/** The text's link cards: the ones it had for links it still has. */
function linkCardsFor(message: PdsMessage, body: string) {
  const links = previewedUrls(body);
  if (links.length === 0) return undefined;
  return links.map(
    (link) =>
      message.linkPreviews?.find((card) => card.link === link) ?? { link },
  );
}

interface EditArgs {
  body: string;
  conversationId: string;
  mentions?: Mention[];
  messageId: string;
}

/** Shows the new text, marked edited, and in replies' quotes of it. */
function showEdit(store: Store, args: EditArgs) {
  const body = args.body.trim();
  const editedAt = startTime(args);
  const change = {
    conversationId: args.conversationId,
    message: (message: PdsMessage) => {
      const linkPreviews = linkCardsFor(message, body);
      return {
        ...message,
        body,
        editedAt,
        linkPreview: linkPreviews?.[0]?.preview ?? null,
        linkPreviews,
        mentions: args.mentions?.length === 0 ? undefined : args.mentions,
      };
    },
    messageId: args.messageId,
    quote: (quote: Quote) => ({ ...quote, body }),
  } satisfies Change;
  changePages(store, change);
  changeLastMessage(store, change, change.message);
}

interface DeleteArgs {
  conversationId: string;
  messageId: string;
}

/** What a deleted message leaves (shown only for a thread's original). */
function deleted(message: PdsMessage, deletedAt: number) {
  return {
    attachments: [],
    authorId: message.authorId,
    authorName: message.authorName,
    body: "",
    conversationId: message.conversationId,
    deletedAt,
    linkPreview: null,
    messageId: message.messageId,
    sentAt: message.sentAt,
  } satisfies PdsMessage;
}

/**
 * The newest message the conversation shows from before `message`, among
 * its loaded pages, for the inbox once `message` is deleted.
 */
function lastBefore(store: Store, message: PdsMessage) {
  return store
    .getAllQueries(pds.messages.list)
    .filter(({ args }) => args.conversationId === message.conversationId)
    .flatMap(({ value }) => value?.messages ?? [])
    .filter(
      (other) =>
        other.sentAt < message.sentAt &&
        other.threadOnly !== true &&
        other.deletedAt === undefined,
    )
    .reduce<PdsMessage | null>(
      (newest, other) =>
        newest === null || other.sentAt > newest.sentAt ? other : newest,
      null,
    );
}

/** Takes a deleted reply out of its thread's count on your home PDS. */
function uncountReply(store: Store, reply: PdsMessage) {
  const { threadId } = reply;
  if (threadId === undefined) return;
  for (const { args, request, value } of store.getAllQueries(
    pds.messages.threadSummaries,
  )) {
    if (value === undefined || args.conversationId !== reply.conversationId) {
      continue;
    }
    store.setQuery(
      request,
      value.flatMap((summary) => {
        if (summary.threadId !== threadId) return [summary];
        if (summary.replyCount <= 1) return [];
        return [{ ...summary, replyCount: summary.replyCount - 1 }];
      }),
    );
  }
}

/** The message, among the home PDS's loaded pages and threads. */
function findMessage(store: Store, { conversationId, messageId }: DeleteArgs) {
  const pages = [
    ...store.getAllQueries(pds.messages.list),
    ...store.getAllQueries(pds.messages.thread),
  ];
  for (const { args, value } of pages) {
    if (value === undefined || args.conversationId !== conversationId) continue;
    const found = value.messages.find((item) => item.messageId === messageId);
    if (found !== undefined) return found;
    if ("root" in value && value.root?.messageId === messageId) {
      return value.root;
    }
  }
  return undefined;
}

/**
 * Shows the message deleted: the conversation shows a thread's original
 * that has replies as a placeholder, and nothing of any other (see
 * `useMessages`). Replies quoting it say it was deleted.
 */
function showDelete(store: Store, args: DeleteArgs) {
  const deletedAt = startTime(args);
  const message = findMessage(store, args);
  const change = {
    conversationId: args.conversationId,
    message: (found: PdsMessage) => deleted(found, deletedAt),
    messageId: args.messageId,
    quote: ({ authorId, messageId }: Quote) => ({
      authorId,
      body: "",
      deleted: true,
      messageId,
    }),
  } satisfies Change;
  changePages(store, change);
  if (message === undefined) return;
  uncountReply(store, message);
  const previous = lastBefore(store, message);
  if (previous !== null) changeLastMessage(store, change, () => previous);
}

/**
 * Editing and deleting your own messages in a conversation, shown right
 * away; a failure puts the message back as it was and says so.
 */
export function useMessageEdits(conversationId: string) {
  const { address } = useAccount();
  const edit = useMutation(
    pdsMutation({
      mutation: pds.messages.editMessage,
      optimisticUpdate: showEdit,
      session: address,
    }),
  );
  const remove = useMutation(
    pdsMutation({
      mutation: pds.messages.deleteMessage,
      optimisticUpdate: showDelete,
      session: address,
    }),
  );
  return {
    edit: (messageId: string, body: string, mentions: readonly Mention[]) => {
      edit.mutate(
        { body, conversationId, mentions: [...mentions], messageId },
        {
          onError: () =>
            Alert.alert("Couldn't Edit Message", "Try again in a moment."),
        },
      );
    },
    delete: (messageId: string) => {
      // This device's copy of one it sent would show again once the
      // PDS's is gone.
      deleteOutgoing(messageId);
      remove.mutate(
        { conversationId, messageId },
        {
          onError: () =>
            Alert.alert("Couldn't Delete Message", "Try again in a moment."),
        },
      );
    },
  };
}

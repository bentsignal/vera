import type {
  Attachment,
  Message as PdsMessage,
} from "@decentralized-convex/messages";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { pdsMutation } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import type { OutgoingDraft, OutgoingMessage } from "./outbox";
import type { ReactionSummary } from "./reactions";
import type {
  Message,
  ReplyTarget,
  ThreadInfo,
} from "~/features/conversation/types";
import { useAccount } from "./account";
import { useMessageWindow } from "./message-window";
import { sendOutgoing, useOutbox } from "./outbox";
import { reactionsCached, useReactions } from "./reactions";
import { useMarkUpTo } from "./read-marks";
import { shownMessage, shownUnconfirmed } from "./shown-messages";
import { summariesCached, useThreadSummaries } from "./threads";
import { unconfirmedSends } from "./unconfirmed";

/**
 * The pages whose messages show. The pages the window opened with wait for
 * their messages' reactions and threads too, so the conversation never
 * appears and then grows under them. Pages loaded later show as soon as
 * their messages arrive: they load past the edge of the screen, where rows
 * that grow move nothing you're looking at, and waiting would leave you at
 * the top of the list longer. Once shown, a page stays, even while its
 * reactions reload.
 */
function useSettledPages(
  pages: ReturnType<typeof useMessageWindow>["pages"],
  isComplete: (messages: readonly PdsMessage[]) => boolean,
) {
  const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
  const ready = pages.filter(
    (page) =>
      page.data !== undefined &&
      (!page.initial || isComplete(page.data.messages)),
  );
  const newlyReady = ready.filter((page) => !settled.has(page.key));
  if (newlyReady.length > 0) {
    setSettled(new Set([...settled, ...newlyReady.map((page) => page.key)]));
  }
  const readyKeys = new Set(ready.map((page) => page.key));
  const shownPages = pages.filter(
    (page) => settled.has(page.key) || readyKeys.has(page.key),
  );
  const shownKeys = new Set(shownPages.map((page) => page.key));
  return {
    /** The window's opening pages haven't all loaded yet. */
    isLoading: pages.some((page) => page.initial && !shownKeys.has(page.key)),
    shownIds: new Set(
      shownPages.flatMap(
        (page) => page.data?.messages.map(({ messageId }) => messageId) ?? [],
      ),
    ),
  };
}

/**
 * Shows the window the conversation is opening instead (see
 * `jumpToLatest`) once its pages have loaded with their reactions and
 * threads, which come with them, so it replaces what's shown without a
 * blank screen in between.
 */
function useShowNext(
  view: ReturnType<typeof useMessageWindow>,
  address: string,
  conversationId: string,
) {
  const queryClient = useQueryClient();
  const { next } = view;
  if (next === undefined) return;
  const loaded = next.pages.every(
    (page) => !page.initial || page.data !== undefined,
  );
  if (
    loaded &&
    reactionsCached(queryClient, address, conversationId, next.parts) &&
    summariesCached(queryClient, address, conversationId, next.parts)
  ) {
    view.showNext();
  }
}

/**
 * No reactions, the same array each time, so a send not yet confirmed is
 * the same message from render to render (see `shownUnconfirmed`).
 */
const NO_REACTIONS = Object.freeze<ReactionSummary[]>([]);

/** What a reply quotes of the message it answers. */
export function quoteOf(message: {
  attachments: readonly Attachment[];
  authorId: string;
  body?: string;
}) {
  return {
    attachment: message.attachments[0],
    authorId: message.authorId,
    body: message.body ?? "",
  };
}

/**
 * Replies this device is still sending, by thread, which the PDS doesn't
 * count yet. One that failed isn't a reply until it's sent.
 */
function sendingReplies(outbox: readonly OutgoingMessage[]) {
  const counts = new Map<string, number>();
  for (const { reply, status } of outbox) {
    if (reply === undefined || status !== "sending") continue;
    counts.set(reply.threadId, (counts.get(reply.threadId) ?? 0) + 1);
  }
  return counts;
}

/** Which of this device's sends show where. */
function outboxFor(
  outbox: readonly OutgoingMessage[],
  threadId: string | undefined,
) {
  return outbox.filter(({ reply }) =>
    threadId === undefined
      ? reply === undefined || reply.inChat
      : reply?.threadId === threadId,
  );
}

/**
 * Each message's thread, counting replies this device is still sending.
 * In a thread, only the thread's own count is asked for.
 */
function useThreads({
  address,
  conversationId,
  view,
  outbox,
  threadId,
}: {
  address: string;
  conversationId: string;
  view: ReturnType<typeof useMessageWindow>;
  outbox: readonly OutgoingMessage[];
  threadId: string | undefined;
}) {
  const summaries = useThreadSummaries(
    address,
    conversationId,
    threadId === undefined
      ? view.parts
      : { liveThreadIds: [], since: undefined, threadIds: [[threadId]] },
    threadId === undefined ? view.next?.parts : undefined,
  );
  const sending = sendingReplies(outbox);
  function threadOf(id: string) {
    const known = summaries.threadOf(id);
    const pending = sending.get(id) ?? 0;
    if (pending === 0) return known;
    return {
      repliers: [
        address,
        ...(known?.repliers ?? []).filter((replier) => replier !== address),
      ],
      replyCount: (known?.replyCount ?? 0) + pending,
    };
  }
  return { isLoaded: summaries.isLoaded, threadOf };
}

/**
 * Where a new message goes: in a thread, a reply to its original that
 * stays there; in the conversation, a reply to `replyTo` if given, which
 * shows there and joins its thread.
 */
function replyFor(root: PdsMessage | null, replyTo: ReplyTarget | undefined) {
  if (root !== null) {
    return { inChat: false, quote: quoteOf(root), threadId: root.messageId };
  }
  if (replyTo === undefined) return undefined;
  if (replyTo.threadId === undefined) {
    return { inChat: true, quote: replyTo.quote, threadId: replyTo.id };
  }
  return {
    answers: replyTo.id,
    inChat: true,
    quote: replyTo.quote,
    threadId: replyTo.threadId,
  };
}

/** How many replies a thread has; 0 outside one. */
function replyCountOf(
  threadOf: (id: string) => ThreadInfo | undefined,
  threadId: string | undefined,
) {
  if (threadId === undefined) return 0;
  return threadOf(threadId)?.replyCount ?? 0;
}

/**
 * Whether a message shows: a deleted one only as a thread's original
 * with replies, which keeps its place over its thread's count.
 */
function isShown(message: Message) {
  if (message.deleted !== true) return true;
  return (
    message.threadId === undefined && (message.thread?.replyCount ?? 0) > 0
  );
}

/** The newest message's time, when it's the newest there is. */
function newestSentAt(view: ReturnType<typeof useMessageWindow>) {
  return view.live ? view.messages.at(-1)?.sentAt : undefined;
}

/**
 * Messages oldest first, opened at the latest message or around `anchor`,
 * with this device's unconfirmed sends at the end. With `threadId`, a
 * thread's replies instead, and its original as `root`.
 */
export function useMessages(
  conversationId: string,
  { anchor, threadId }: { anchor?: string; threadId?: string } = {},
) {
  const { address, session } = useAccount();
  const inThread = threadId !== undefined;
  const view = useMessageWindow(address, { conversationId, threadId }, anchor);
  const { parts } = view;
  const { reactionsOf, sinceOf, toggle } = useReactions(
    address,
    conversationId,
    inThread
      ? { ...parts, messageIds: [[threadId], ...parts.messageIds] }
      : parts,
    view.next?.parts,
  );
  const outbox = useOutbox(address, conversationId);
  const threads = useThreads({
    address,
    conversationId,
    outbox,
    threadId,
    view,
  });
  const settled = useSettledPages(view.pages, (messages) =>
    messages.every(
      (message) =>
        reactionsOf(message.messageId) !== undefined &&
        threads.isLoaded(message.threadId ?? message.messageId),
    ),
  );
  useShowNext(view, address, conversationId);
  const sentById = new Map(outbox.map((item) => [item.messageId, item]));
  function how(message: { threadId?: string; messageId: string }) {
    return {
      inThread,
      reactions: reactionsOf(message.messageId),
      sent: sentById.get(message.messageId),
      thread: threads.threadOf(message.threadId ?? message.messageId),
    };
  }
  const unconfirmed = unconfirmedSends(outboxFor(outbox, threadId), view).map(
    (message) =>
      shownUnconfirmed(message, {
        ...how({
          messageId: message.messageId,
          threadId: message.reply?.threadId,
        }),
        address,
        conversationId,
        reactions: NO_REACTIONS,
      }),
  );
  const { root } = view;
  // A thread waits for its original's reactions too. (Its original is
  // missing once its pages have loaded without it.)
  const rootLoading =
    root !== null && reactionsOf(root.messageId) === undefined;

  return {
    ...view,
    isLoading: settled.isLoading || rootLoading,
    messages: [
      ...view.messages
        .filter((message) => settled.shownIds.has(message.messageId))
        .map((message) => shownMessage(message, how(message)))
        .filter(isShown),
      ...unconfirmed,
    ],
    /** A thread's original, once loaded; undefined if it doesn't exist. */
    root: root === null ? undefined : shownMessage(root, how(root)),
    /** How many replies a thread has. */
    replyCount: replyCountOf(threads.threadOf, threadId),
    /** Adds or removes your reaction, showing it right away. */
    toggleReaction: toggle,
    /** Which query by time has a message's reactions, if one does. */
    reactionsSince: sinceOf,
    /** Only set when the newest loaded message is the newest there is. */
    newestSentAt: newestSentAt(view),
    /**
     * Sends a message, shown right away; its files upload after that.
     * In the conversation, `replyTo` makes it a reply shown there; in a
     * thread, it's always a reply, kept there.
     */
    sendMessage: (draft: OutgoingDraft, replyTo?: ReplyTarget) => {
      if (!view.live) view.jumpToLatest();
      sendOutgoing(session, conversationId, {
        ...draft,
        reply: replyFor(root, replyTo),
      });
    },
  };
}

/**
 * Marks the conversation read up to the newest message while it is open,
 * at most every couple of seconds (see `useMarkUpTo`).
 */
export function useMarkRead(conversationId: string, newestSentAt?: number) {
  const { address } = useAccount();
  const { mutate } = useMutation({
    ...pdsMutation({ mutation: pds.messages.markRead, session: address }),
    // Not something you did: it doesn't hurry query updates along (see
    // `NOTIFY_GAP_MS`).
    meta: { background: true },
  });
  useMarkUpTo(newestSentAt, (readAt) => mutate({ conversationId, readAt }));
}

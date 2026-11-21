import type {
  Message,
  Reaction,
  ThreadListing,
  ThreadSummary,
  Typist,
} from "./shapes.ts";

// What each member's PDS is believed about when a conversation's messages,
// reactions, typing, and threads are gathered from all of them (see
// `Operation.trust` in `@decentralized-convex/plugin`). Each PDS stores
// its own accounts' messages and reactions, so it speaks only for those:
// anything it sends about another server's accounts is left out before
// the app sees it.

type Owns = (accountId: string) => boolean;

/**
 * A message from its author's PDS. A reply quoting someone on another
 * server keeps who and which message it quotes, but not the words: those
 * are the replier's PDS's copy, which it could make up. The app shows the
 * quoted message itself when it opens it.
 */
function ownMessage(message: Message, owns: Owns): Message | null {
  if (!owns(message.authorId)) return null;
  const { quote } = message;
  if (quote === undefined || owns(quote.authorId)) return message;
  return {
    ...message,
    quote: {
      authorId: quote.authorId,
      body: "",
      ...(quote.deleted === undefined ? {} : { deleted: quote.deleted }),
      ...(quote.messageId === undefined ? {} : { messageId: quote.messageId }),
    },
  };
}

export function ownMessages(messages: readonly Message[], owns: Owns) {
  return messages.flatMap((message) => {
    const own = ownMessage(message, owns);
    return own === null ? [] : [own];
  });
}

/** A page of messages: only those its PDS's own accounts sent. */
export function trustMessagePage<
  Page extends { readonly messages: readonly Message[] },
>(page: Page, { owns }: { readonly owns: Owns }): Page {
  return { ...page, messages: ownMessages(page.messages, owns) };
}

/** A thread's page: its replies, and its original only from its author's PDS. */
export function trustThreadPage<
  Page extends {
    readonly messages: readonly Message[];
    readonly root: Message | null;
  },
>(page: Page, { owns }: { readonly owns: Owns }): Page {
  return {
    ...page,
    messages: ownMessages(page.messages, owns),
    root: page.root === null ? null : ownMessage(page.root, owns),
  };
}

export function trustReactions(
  reactions: readonly Reaction[],
  { owns }: { readonly owns: Owns },
) {
  return reactions.filter((reaction) => owns(reaction.accountId));
}

export function trustTypists(
  typists: readonly Typist[],
  { owns }: { readonly owns: Owns },
) {
  return typists.filter((typist) => owns(typist.accountId));
}

/**
 * A PDS's count of a thread's replies: the replies it stores, so only its
 * own accounts can have written them. One that names none of its own
 * repliers has no replies to count.
 */
function ownSummary<Summary extends ThreadSummary>(
  summary: Summary,
  owns: Owns,
): Summary | null {
  const repliers = summary.repliers.filter(owns);
  return repliers.length === 0 ? null : { ...summary, repliers };
}

export function trustThreadSummaries(
  summaries: readonly ThreadSummary[],
  { owns }: { readonly owns: Owns },
) {
  return summaries.flatMap((summary) => {
    const own = ownSummary(summary, owns);
    return own === null ? [] : [own];
  });
}

/**
 * A PDS's listing of a conversation's threads: its replies (as in
 * `threadSummaries`), and the original only from its author's PDS.
 */
export function trustThreadListings<
  Page extends { readonly threads: readonly ThreadListing[] },
>(page: Page, { owns }: { readonly owns: Owns }): Page {
  return {
    ...page,
    threads: page.threads.flatMap((listing) => {
      const root =
        listing.root === null ? null : ownMessage(listing.root, owns);
      const repliers = listing.repliers.filter(owns);
      if (repliers.length === 0 && root === null) return [];
      // With none of its own repliers, it stores none of the replies.
      return repliers.length === 0
        ? [{ ...listing, replyCount: 0, repliers, root, unreadCount: 0 }]
        : [{ ...listing, repliers, root }];
    }),
  };
}

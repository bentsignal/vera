import type { Reaction } from "@decentralized-convex/messages";
import type { QueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useMutation, useQueries } from "@tanstack/react-query";
import { MAX_REACTION_MESSAGES } from "@decentralized-convex/messages";
import { pdsMutation, pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import type { ReactionPart } from "./reaction-part";
import type { Pending } from "./reaction-toggles";
import { reactionPart } from "./reaction-part";
import {
  overrideKey,
  parseOverrideKey,
  settled,
  toggled,
} from "./reaction-toggles";
import { cachedSelected, pdsResultOr } from "./results";

/** The emoji offered first when reacting, in order. */
export const QUICK_REACTIONS = ["❤️", "👍", "👎", "😂", "😮", "😢", "🔥", "🎉"];

/** No reactions, the same array each time so rows don't redraw. */
const NONE = Object.freeze<ReactionSummary[]>([]);

export type { ReactionPart } from "./reaction-part";
export { attachmentPart, parsePart, reactionPart } from "./reaction-part";

/** The reactions on one part of a message. */
export function reactionsOn(
  reactions: readonly ReactionSummary[] | undefined,
  part: ReactionPart,
) {
  return (reactions ?? NONE).filter((reaction) => reaction.part === part);
}

/** One emoji's reactions to a part of a message, as shown on it. */
export interface ReactionSummary {
  readonly part: ReactionPart;
  readonly emoji: string;
  readonly count: number;
  /** Whether the signed-in account reacted with it. */
  readonly mine: boolean;
  /** Who reacted with it, earliest first. */
  readonly accounts: readonly string[];
}

/** A page's message IDs in the batches its reactions are asked for in. */
export function chunks(ids: readonly string[]) {
  return Array.from(
    { length: Math.ceil(ids.length / MAX_REACTION_MESSAGES) },
    (_, index) =>
      ids.slice(
        index * MAX_REACTION_MESSAGES,
        (index + 1) * MAX_REACTION_MESSAGES,
      ),
  );
}

/** A part as the protocol's `attachment` and `link` name it. */
export function partArgs(part: ReactionPart) {
  if (typeof part === "number") return { attachment: part };
  if (part === "message") return {};
  return { link: Number(part.slice("link-".length)) };
}

/** The key of one emoji on one part, unique within a message. */
function emojiKey(part: ReactionPart, emoji: string) {
  return `${part} ${emoji}`;
}

interface Tally {
  readonly part: ReactionPart;
  readonly emoji: string;
  readonly accounts: Set<string>;
}

function summarize(
  reactions: readonly Reaction[],
  self: string,
  overrides: ReadonlyMap<string, Pending>,
) {
  // Who reacted with what on each part, per message, with this device's
  // pending toggles.
  const byMessage = new Map<string, Map<string, Tally>>();
  function tally(messageId: string, part: ReactionPart, emoji: string) {
    const emojis = byMessage.get(messageId) ?? new Map<string, Tally>();
    byMessage.set(messageId, emojis);
    const key = emojiKey(part, emoji);
    const found = emojis.get(key) ?? { accounts: new Set(), emoji, part };
    emojis.set(key, found);
    return found.accounts;
  }
  const earliestFirst = [...reactions].sort(
    (left, right) => left.reactedAt - right.reactedAt,
  );
  for (const reaction of earliestFirst) {
    const { accountId, emoji, messageId } = reaction;
    tally(messageId, reactionPart(reaction), emoji).add(accountId);
  }
  for (const [key, { on }] of overrides) {
    const { emoji, messageId, part } = parseOverrideKey(key);
    const accounts = tally(messageId, part, emoji);
    if (on) accounts.add(self);
    else accounts.delete(self);
  }
  return new Map(
    [...byMessage].map(([messageId, emojis]) => [
      messageId,
      [...emojis.values()]
        .filter(({ accounts }) => accounts.size > 0)
        .map(
          ({ accounts, emoji, part }) =>
            ({
              accounts: [...accounts],
              count: accounts.size,
              emoji,
              mine: accounts.has(self),
              part,
            }) satisfies ReactionSummary,
        ),
    ]),
  );
}

/** The reactions to one batch of a page's messages. */
export function reactionsQuery(
  session: string,
  conversationId: string,
  messageIds: readonly string[],
) {
  return pdsQuery({
    args: { conversationId, messageIds: [...messageIds] },
    options: {
      enabled: messageIds.length > 0,
      // A PDS that can't answer leaves the messages without reactions
      // rather than holding them back.
      select: (result) => pdsResultOr(result, [])?.flat(),
    },
    query: pds.messages.reactions,
    session,
  });
}

/** Every reaction made after `since`: the newest messages' (see `windowParts`). */
export function reactionsSinceQuery(
  session: string,
  conversationId: string,
  since: number,
) {
  return pdsQuery({
    args: { conversationId, since },
    options: { select: (result) => pdsResultOr(result, [])?.flat() },
    query: pds.messages.reactions,
    session,
  });
}

/** Whether the queries `sources` asks for have answers in the cache. */
export function reactionsCached(
  queryClient: QueryClient,
  session: string,
  conversationId: string,
  { messageIds, since }: Pick<ReactionSources, "messageIds" | "since">,
) {
  const queries = [
    ...messageIds
      .flatMap(chunks)
      .map((ids) => reactionsQuery(session, conversationId, ids)),
    ...(since === undefined
      ? []
      : [reactionsSinceQuery(session, conversationId, since)]),
  ];
  return queries.every(
    (query) => cachedSelected(queryClient, query) !== undefined,
  );
}

/** Where a window's reactions come from (see `windowParts`). */
export interface ReactionSources {
  /** Batches of messages, each a fixed set, by page. */
  readonly messageIds: readonly (readonly string[])[];
  /** Everything reacted to after this, when set. */
  readonly since: number | undefined;
  /** The loaded messages `since` covers. */
  readonly liveIds: readonly string[];
}

/**
 * Reactions to the loaded messages, and a toggle that shows immediately.
 * Each page's messages from before the window went live are asked for in
 * fixed batches, so paging never refetches what's on screen, and newer
 * ones by time, so a message arriving changes no query.
 */
export function useReactions(
  session: string,
  conversationId: string,
  { liveIds, messageIds, since }: ReactionSources,
  /**
   * The window opening instead, if any (see `jumpToLatest`): asked for
   * too, so they're there when it shows.
   */
  ahead?: Pick<ReactionSources, "messageIds" | "since">,
) {
  // Pending toggles: in state, to show them, and in a ref, so a second
  // tap before the next render sees the first (see `toggled`).
  const [overrides, setOverrides] = useState<ReadonlyMap<string, Pending>>(
    new Map(),
  );
  const pending = useRef<ReadonlyMap<string, Pending>>(overrides);
  const toggles = useRef(0);
  const batches = messageIds.flatMap(chunks);
  function queriesFor(ids: readonly (readonly string[])[], after?: number) {
    return [
      ...ids.map((batch) => reactionsQuery(session, conversationId, batch)),
      ...(after === undefined
        ? []
        : [reactionsSinceQuery(session, conversationId, after)]),
    ];
  }
  const { loaded, reactions } = useQueries({
    queries: [
      ...queriesFor(batches, since),
      ...queriesFor(ahead?.messageIds.flatMap(chunks) ?? [], ahead?.since),
    ],
    // TanStack shares this structurally with the last result, so a message
    // whose reactions didn't change keeps the same array and its row
    // doesn't redraw.
    combine: (results) => {
      const sinceAnswer =
        since === undefined ? undefined : results[batches.length]?.data;
      return {
        loaded: [
          ...batches.flatMap((ids, index) =>
            results[index]?.data === undefined ? [] : ids,
          ),
          ...(sinceAnswer === undefined ? [] : liveIds),
        ],
        reactions: Object.fromEntries(
          summarize(
            results.flatMap((result) => result.data ?? []),
            session,
            overrides,
          ),
        ),
      };
    },
  });
  const react = useMutation(
    pdsMutation({ mutation: pds.messages.react, session }),
  );

  function setPending(next: ReadonlyMap<string, Pending>) {
    pending.current = next;
    setOverrides(next);
  }

  const loadedIds = new Set(loaded);
  const live = new Set(liveIds);

  return {
    /** A message's reactions, or undefined while they are still loading. */
    reactionsOf: (messageId: string) =>
      loadedIds.has(messageId) ? (reactions[messageId] ?? NONE) : undefined,
    /** The `since` of the query with a message's reactions, if it's by time. */
    sinceOf: (messageId: string) => (live.has(messageId) ? since : undefined),
    toggle: (messageId: string, emoji: string, part: ReactionPart) => {
      const key = overrideKey(messageId, part, emoji);
      const mine =
        reactions[messageId]?.some(
          (item) => item.part === part && item.emoji === emoji && item.mine,
        ) ?? false;
      toggles.current += 1;
      const seq = toggles.current;
      const { next, on } = toggled(pending.current, key, mine, seq);
      setPending(next);
      react.mutate(
        {
          ...partArgs(part),
          conversationId,
          emoji,
          messageId,
          on,
        },
        // Done, the live query has the result by now; failed, the server
        // never changed. Either way the newest toggle's stand-in goes.
        { onSettled: () => setPending(settled(pending.current, key, seq)) },
      );
    },
  };
}

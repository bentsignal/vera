import type { Reaction } from "@decentralized-convex/messages";
import type { QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useMutation, useQueries } from "@tanstack/react-query";
import { MAX_REACTION_MESSAGES } from "@decentralized-convex/messages";
import { pdsMutation, pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { cachedSelected, pdsResultOr } from "./results";

/** The emoji offered first when reacting, in order. */
export const QUICK_REACTIONS = ["❤️", "👍", "👎", "😂", "😮", "😢", "🔥", "🎉"];

/** No reactions, the same array each time so rows don't redraw. */
const NONE = Object.freeze<ReactionSummary[]>([]);

/**
 * Which part of a message a reaction is on: one of its attachments, by
 * index, one of its link previews (`link-<index>`), or `message`, the
 * message itself (its text, or its first attachment when it has no text,
 * or its first link preview when its text is only links; see `reaction`
 * in the protocol).
 */
export type ReactionPart = number | "message" | `link-${number}`;

/**
 * The part a message's attachment is: the first of a message without text
 * is the message itself, so a reaction to it is one older apps show too.
 */
export function attachmentPart(
  message: { readonly body?: string },
  index: number,
) {
  return index === 0 && message.body === undefined
    ? ("message" as const)
    : index;
}

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

/** A reaction's part, from the protocol's `attachment` and `link`. */
export function reactionPart({
  attachment,
  link,
}: {
  attachment?: number;
  link?: number;
}) {
  if (link !== undefined) return `link-${link}` as const;
  return attachment ?? ("message" as const);
}

/** A part as the protocol's `attachment` and `link` name it. */
export function partArgs(part: ReactionPart) {
  if (typeof part === "number") return { attachment: part };
  if (part === "message") return {};
  return { link: Number(part.slice("link-".length)) };
}

/** A part written out as text (a route's, or `overrideKey`'s), read back. */
export function parsePart(part: string) {
  if (part === "message") return "message" as const;
  const link = /^link-(\d+)$/.exec(part)?.[1];
  if (link !== undefined) return `link-${Number(link)}` as const;
  return Number(part);
}

/** A pending toggle's key: the message, the part, and the emoji. */
function overrideKey(messageId: string, part: ReactionPart, emoji: string) {
  return `${messageId} ${part} ${emoji}`;
}

function parseOverrideKey(key: string) {
  const [messageId = "", part = "", emoji = ""] = key.split(" ");
  return { emoji, messageId, part: parsePart(part) };
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
  overrides: ReadonlyMap<string, boolean>,
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
  for (const [key, on] of overrides) {
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
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(
    new Map(),
  );
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

  function setOverride(key: string, on: boolean | undefined) {
    setOverrides((current) => {
      const next = new Map(current);
      if (on === undefined) next.delete(key);
      else next.set(key, on);
      return next;
    });
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
      const on = !(
        reactions[messageId]?.some(
          (item) => item.part === part && item.emoji === emoji && item.mine,
        ) ?? false
      );
      const key = overrideKey(messageId, part, emoji);
      setOverride(key, on);
      react.mutate(
        {
          ...partArgs(part),
          conversationId,
          emoji,
          messageId,
          on,
        },
        // The live query has the result by now; drop the stand-in.
        { onSettled: () => setOverride(key, undefined) },
      );
    },
  };
}

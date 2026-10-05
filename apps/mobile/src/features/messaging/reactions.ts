import type { Reaction } from "@decentralized-convex/messages";
import { useState } from "react";
import { useMutation, useQueries } from "@tanstack/react-query";
import { MAX_REACTION_MESSAGES } from "@decentralized-convex/messages";
import { pdsMutation, pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { pdsResult } from "./results";

/** The emoji offered first when reacting, in order. */
export const QUICK_REACTIONS = ["❤️", "👍", "👎", "😂", "😮", "😢", "🔥", "🎉"];

/** One emoji's reactions to a message, as shown under it. */
export interface ReactionSummary {
  readonly emoji: string;
  readonly count: number;
  /** Whether the signed-in account reacted with it. */
  readonly mine: boolean;
}

function chunks(ids: readonly string[]) {
  return Array.from(
    { length: Math.ceil(ids.length / MAX_REACTION_MESSAGES) },
    (_, index) =>
      ids.slice(
        index * MAX_REACTION_MESSAGES,
        (index + 1) * MAX_REACTION_MESSAGES,
      ),
  );
}

function summarize(
  reactions: readonly Reaction[],
  self: string,
  overrides: ReadonlyMap<string, boolean>,
) {
  // Who reacted with what, per message, with this device's pending toggles.
  const byMessage = new Map<string, Map<string, Set<string>>>();
  for (const { accountId, emoji, messageId } of reactions) {
    const emojis = byMessage.get(messageId) ?? new Map<string, Set<string>>();
    emojis.set(emoji, (emojis.get(emoji) ?? new Set()).add(accountId));
    byMessage.set(messageId, emojis);
  }
  for (const [key, on] of overrides) {
    const [messageId = "", emoji = ""] = key.split(" ");
    const emojis = byMessage.get(messageId) ?? new Map<string, Set<string>>();
    const accounts = emojis.get(emoji) ?? new Set();
    if (on) accounts.add(self);
    else accounts.delete(self);
    emojis.set(emoji, accounts);
    byMessage.set(messageId, emojis);
  }
  return new Map(
    [...byMessage].map(([messageId, emojis]) => [
      messageId,
      [...emojis]
        .filter(([, accounts]) => accounts.size > 0)
        .map(([emoji, accounts]) => ({
          count: accounts.size,
          emoji,
          mine: accounts.has(self),
        })),
    ]),
  );
}

/**
 * Reactions to the loaded messages (one query per page, so paging never
 * refetches what is on screen) and a toggle that shows immediately.
 */
export function useReactions(
  session: string,
  conversationId: string,
  pageMessageIds: readonly (readonly string[])[],
) {
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(
    new Map(),
  );
  const batches = pageMessageIds.flatMap(chunks);
  const results = useQueries({
    queries: batches.map((messageIds) =>
      pdsQuery({
        args: { conversationId, messageIds },
        options: {
          enabled: messageIds.length > 0,
          select: (result) => pdsResult(result)?.flat(),
        },
        query: pds.messages.reactions,
        session,
      }),
    ),
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

  const reactions = summarize(
    results.flatMap((result) => result.data ?? []),
    session,
    overrides,
  );
  const loaded = new Set(
    batches.flatMap((messageIds, index) =>
      results[index]?.data === undefined ? [] : messageIds,
    ),
  );

  return {
    /** A message's reactions, or undefined while they are still loading. */
    reactionsOf: (messageId: string) =>
      loaded.has(messageId) ? (reactions.get(messageId) ?? []) : undefined,
    toggle: (messageId: string, emoji: string) => {
      const on = !(
        reactions
          .get(messageId)
          ?.some((item) => item.emoji === emoji && item.mine) ?? false
      );
      const key = `${messageId} ${emoji}`;
      setOverride(key, on);
      react.mutate(
        { conversationId, emoji, messageId, on },
        // The live query has the result by now; drop the stand-in.
        { onSettled: () => setOverride(key, undefined) },
      );
    },
  };
}

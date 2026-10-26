import { useEffect, useState } from "react";
import { AppState } from "react-native";
// eslint-disable-next-line no-restricted-imports -- Expo Router has no route loaders to preload suspense queries, and typing is live, never something to wait for.
import { useQuery } from "@tanstack/react-query";
import { TYPING_REFRESH, TYPING_TIMEOUT } from "@decentralized-convex/messages";
import { pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import type { AccountSession } from "~/features/session/account-session";
import { useAccount } from "./account";
import { pdsResultOr } from "./results";
import { lastSentByAuthor, shownTypists } from "./typing-state";

/** Who's typing in a conversation, or with `threadId`, in that thread. */
export function typingQuery(
  session: string,
  conversationId: string,
  threadId?: string,
) {
  return pdsQuery({
    args: { conversationId, threadId },
    options: {
      // A PDS that predates typing shows nobody typing.
      select: (result) => pdsResultOr(result, [])?.flat(),
    },
    query: pds.messages.typing,
    session,
  });
}

/** The key `useTypists` asks for who's typing in a conversation by. */
export function typingQueryKey(session: string, conversationId: string) {
  return typingQuery(session, conversationId).queryKey;
}

/** Nobody, the same array each time so the list doesn't redraw. */
const NOBODY = Object.freeze<string[]>([]);

/**
 * Who else is typing in a conversation, or with `threadId`, in that
 * thread, in the order they started. `messages` are the ones on screen:
 * someone whose message is there, sent after they last typed, isn't
 * typing it anymore. `isLoading` until it's known: a conversation shows
 * with who's typing, never before.
 */
export function useTypists(
  conversationId: string,
  {
    threadId,
    messages,
  }: {
    threadId?: string;
    messages: readonly { authorId: string; sentAt: Date }[];
  },
) {
  const { address } = useAccount();
  // Asked for when the screen opens (or its row is pressed, see
  // `usePrefetchConversation`), alongside the conversation and its pages,
  // so it's there when the messages are. (It isn't included with
  // them: it changes every few seconds while someone types, and would
  // rerun them each time.)
  const query = typingQuery(address, conversationId, threadId);
  const { data, dataUpdatedAt } = useQuery({ ...query, select: query.select });
  const [now, setNow] = useState(Date.now);
  const shown = shownTypists({
    arrivedAt: dataUpdatedAt,
    lastSentAt: lastSentByAuthor(messages),
    now,
    scope: `${address} ${conversationId} ${threadId ?? ""}`,
    typists: data ?? [],
  });
  const { nextChange } = shown;
  // eslint-disable-next-line no-restricted-syntax -- Typing runs out as time passes, which no data change marks: this redraws when the next typist's time is up.
  useEffect(() => {
    if (nextChange === undefined) return undefined;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, nextChange - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [nextChange]);
  return {
    isLoading: data === undefined,
    typists: shown.accountIds.length === 0 ? NOBODY : shown.accountIds,
  };
}

/**
 * Tells the PDS while this device types: right away, then again every
 * `TYPING_REFRESH` while the text keeps changing. Emptying the field,
 * leaving, or putting the app away stops it at once. Sending stops it on
 * the PDS in the same write as the message, so nothing is sent for it
 * here; a stop sent first would hide the indicator before the message
 * arrived.
 */
function createTypingReporter(
  session: AccountSession,
  conversationId: string,
  threadId: string | undefined,
) {
  /** When the PDS was last told this device is typing. */
  let saidAt: number | undefined;
  function say(typing: boolean) {
    // Best effort: a missed one times out on its own.
    void session.pds
      .mutate(pds.messages.setTyping({ conversationId, threadId, typing }))
      .catch(() => null);
  }
  function stop() {
    if (saidAt !== undefined && Date.now() - saidAt < TYPING_TIMEOUT) {
      say(false);
    }
    saidAt = undefined;
  }
  return {
    /** Every change to the field's text; `sent` when sending emptied it. */
    onChangeText: (text: string, sent: boolean) => {
      if (sent) {
        saidAt = undefined;
        return;
      }
      if (text.trim() === "") {
        stop();
        return;
      }
      const now = Date.now();
      if (saidAt !== undefined && now - saidAt < TYPING_REFRESH) return;
      saidAt = now;
      say(true);
    },
    /** Stops, if the PDS was told it's typing (see `useTypingReporter`). */
    stop,
  };
}

/**
 * Reports this device's typing in a conversation, or with `threadId`, a
 * reply in that thread. Returns the composer's `onChangeText`.
 */
export function useTypingReporter(conversationId: string, threadId?: string) {
  const { session } = useAccount();
  const [reporter] = useState(() =>
    createTypingReporter(session, conversationId, threadId),
  );
  // eslint-disable-next-line no-restricted-syntax -- Leaving the screen or the app has to tell the PDS this device stopped typing; nothing else marks either.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") reporter.stop();
    });
    return () => {
      subscription.remove();
      reporter.stop();
    };
  }, [reporter]);
  return reporter.onChangeText;
}

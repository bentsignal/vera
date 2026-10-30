import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";

import type { ThreadLook } from "~/features/conversation/thread-looks";
import { THREAD_LOOKS } from "~/features/conversation/thread-looks";
import { useDevTools } from "./dev-tools";

// Development only: which thread look is on (thread-looks.ts), switched
// from the thread's header, and whether its original pretends it was sent
// a day earlier, to try the looks across a day change on fresh data.

const LOOK_KEY = "vera.dev.threadLook";
const YESTERDAY_KEY = "vera.dev.threadYesterday";

interface State {
  readonly look: ThreadLook;
  readonly yesterday: boolean;
}

let current: State | undefined;
const listeners = new Set<() => void>();

function state() {
  if (current === undefined) {
    const stored = SecureStore.getItem(LOOK_KEY);
    current = {
      look: THREAD_LOOKS.find(({ id }) => id === stored)?.id ?? "current",
      yesterday: SecureStore.getItem(YESTERDAY_KEY) === "true",
    };
  }
  return current;
}

function change(next: State) {
  current = next;
  SecureStore.setItem(LOOK_KEY, next.look);
  SecureStore.setItem(YESTERDAY_KEY, String(next.yesterday));
  for (const listener of listeners) listener();
}

/** The next look (`step` 1) or the one before (-1); returns its name. */
export function stepThreadLook(step: 1 | -1) {
  const index = THREAD_LOOKS.findIndex(({ id }) => id === state().look);
  const count = THREAD_LOOKS.length;
  const next = THREAD_LOOKS[(index + step + count) % count] ?? THREAD_LOOKS[0];
  change({ ...state(), look: next.id });
  return `${(index + step + count) % count}. ${next.name}`;
}

/** Turns the pretend day earlier on or off; returns what it is now. */
export function toggleThreadYesterday() {
  const yesterday = !state().yesterday;
  change({ ...state(), yesterday });
  return yesterday ? "Original Sent Yesterday" : "Original at Its Real Time";
}

export function useThreadLook() {
  return useSyncExternalStore((onChange) => {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }, state);
}

/**
 * What a thread screen gives its list and header for the look that's on:
 * the look, and the header's first line and switch. Nothing outside
 * development builds.
 */
export function useThreadLookProps(
  replyCount: number,
  title: string,
  onOpenConversation: () => void,
) {
  const { look, yesterday } = useThreadLook();
  const { enabled } = useDevTools();
  if (!enabled) {
    return { header: {}, threadLook: undefined };
  }
  const count = replyCount === 1 ? "1 reply" : `${replyCount} replies`;
  return {
    header: {
      heading: look === "summary" && replyCount > 0 ? count : undefined,
      lookSwitch: {
        onStep: stepThreadLook,
        onToggleYesterday: toggleThreadYesterday,
      },
    },
    threadLook: { look, onOpenConversation, title, yesterday },
  };
}

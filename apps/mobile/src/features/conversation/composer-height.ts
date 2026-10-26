import type { RefObject } from "react";
import type { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { useId, useState, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import {
  measure,
  useAnimatedRef,
  useSharedValue,
} from "react-native-reanimated";

import type { SendCommitStore } from "./send-commit";
import { markSendState } from "~/features/dev/send-timing";
import { createSendCommit } from "./send-commit";

/** The floating composer's height, as the conversation's list uses it. */
export interface ComposerHeight {
  /** The committed host geometry, distinct from delayed live reports. */
  bar: RefObject<View | null>;
  /** Per-composer local submit/clear identities; never waits for the network. */
  sendCommit: SendCommitStore;
  /** Every height it reports, for the list to follow on the UI thread. */
  live: SharedValue<number>;
  /**
   * Its height in React, undefined until it's laid out (the list waits for
   * it). On iOS that's its first height only; on Android every change.
   */
  laidOut: number | undefined;
  /**
   * How many sends have waited for the composer to get shorter
   * (`report.onSend`), for the list (`useComposerInset`).
   */
  sends: number;
}

/** What the composer tells the list about its height (`useComposerHeight`). */
export type ComposerReport = ReturnType<typeof useComposerHeight>["report"];

/**
 * The composer's height (`ComposerHeight`) and the `report` it gives it
 * through. On iOS a change after the first reaches only the UI thread: as
 * React state it re-rendered the whole conversation, about 250 ms of
 * JavaScript each time, three times as attachments opened or closed, and
 * the list could only catch up after each.
 */
export function useComposerHeight() {
  const live = useSharedValue(0);
  const [laidOut, setLaidOut] = useState<number>();
  const owner = useId();
  const [sendCommit] = useState(() =>
    createSendCommit(owner, (step, value) => markSendState(step, owner, value)),
  );
  const sends = useSyncExternalStore(sendCommit.subscribe, sendCommit.sequence);
  /** The composer's bar, measured on the UI thread (see `heightNow`). */
  const bar = useAnimatedRef<View>();
  /**
   * The bar's height as laid out now, or `fallback` before it's laid out.
   * Measured rather than worked out from `live`: its layout can reach
   * `onHeight` first, and taking a change off `live` again then left the
   * list's inset short by it, the newest messages under the composer until
   * the composer next changed height.
   */
  function heightNow(fallback: number) {
    "worklet";
    return measure(bar)?.height ?? fallback;
  }
  const report = {
    /** Read by the opt-in dev geometry probe; it never writes this value. */
    live,
    sendCommit,
    sends,
    onHeight: (height: number) => {
      // Layout is already committed here. The list needn't wait for this
      // JS callback to go through `live` on UI and back to JS again. Read
      // the current host, since a queued callback may carry an old size.
      if (bar.current !== null) {
        sendCommit.observeLayout(bar.current.getBoundingClientRect().height);
      }
      // Already there, from `onSentShorter` or `onTyped`.
      if (Math.abs(height - live.get()) >= 0.5) live.set(height);
      if (Platform.OS !== "ios" || laidOut === undefined) setLaidOut(height);
    },
    /** For the bar whose height this is (see `heightNow`). */
    bar,
    /**
     * Sending made the composer `by` shorter, seen on the UI thread the
     * frame it happened (a worklet). Its layout reaches JavaScript only
     * once the render of the message sent is done, and the list's inset
     * shrinking then, after the messages had started to move, pulled them
     * back down.
     */
    onSentShorter: (by: number) => {
      "worklet";
      const height = heightNow(live.get() - by);
      // `onHeight` got there first: the list has the new height already.
      if (Math.abs(height - live.get()) < 0.5) return;
      live.set(height);
    },
    /**
     * The field got `by` taller or shorter as you typed, seen on the UI
     * thread the frame it happened (a worklet).
     */
    onTyped: (by: number) => {
      "worklet";
      const height = heightNow(live.get() + by);
      if (Math.abs(height - live.get()) >= 0.5) live.set(height);
    },
    /**
     * Begin a local submission before clearing. The list keeps its rows
     * and inset until this clear's height and sent ID are ready.
     */
    onSend: (clear: number, files: readonly string[]) =>
      sendCommit.begin(clear, files),
  };
  return {
    composerHeight: {
      bar,
      laidOut,
      live,
      sendCommit,
      sends,
    },
    report,
  };
}

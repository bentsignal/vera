import type { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { useState } from "react";
import { Platform } from "react-native";
import {
  measure,
  useAnimatedReaction,
  useAnimatedRef,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { GROW_EASING, GROW_MS } from "./moves";

const IOS = Platform.OS === "ios";
/** How long the list's room takes to follow attachments opening or closing. */
const COMPOSER_EASE_MS = 120;
/**
 * The most frames the list's room waits, after a send makes the composer
 * shorter, for the messages to start making room for it.
 */
const SEND_WAIT_FRAMES = 20;

/**
 * How long the list eases its room after attachments start to open or
 * close: the strip takes 220 ms (see `StagedAttachments`).
 */
const ATTACHMENTS_MOVE_MS = 300;

/** The floating composer's height, as the conversation's list uses it. */
export interface ComposerHeight {
  /** Every height it reports, for the list to follow on the UI thread. */
  live: SharedValue<number>;
  /**
   * Its height in React, undefined until it's laid out (the list waits for
   * it). On iOS that's its first height only; on Android every change,
   * since the list makes room for it in a row (see `useLatest`).
   */
  laidOut: number | undefined;
  /**
   * The list's room for it on iOS, following `live` (see
   * `useComposerRoom`), which the field's glass follows down after a send.
   */
  room: SharedValue<number>;
  /**
   * Set as sending makes the composer shorter, until the list's room
   * takes the new height: that room then closes with the messages making
   * room for the one sent (see `useComposerRoom`).
   */
  sent: SharedValue<boolean>;
  /**
   * Until when (`Date.now()`) the composer's height is changing a step at
   * a time, as attachments open or close.
   */
  stepsUntil: SharedValue<number>;
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
  const room = useSharedValue(0);
  const sent = useSharedValue(false);
  const stepsUntil = useSharedValue(0);
  const [laidOut, setLaidOut] = useState<number>();
  /** The composer's bar, measured on the UI thread (see `heightNow`). */
  const bar = useAnimatedRef<View>();
  /**
   * The bar's height as laid out now, or `fallback` before it's laid out.
   * Measured rather than worked out from `live`: its layout can reach
   * `onHeight` first, and taking a change off `live` again then left the
   * list's room short by it, the newest messages under the composer until
   * the composer next changed height.
   */
  function heightNow(fallback: number) {
    "worklet";
    return measure(bar)?.height ?? fallback;
  }
  const report = {
    onHeight: (height: number) => {
      // Already there, from `onSentShorter` or `onTyped`.
      if (Math.abs(height - live.get()) >= 0.5) live.set(height);
      if (Platform.OS !== "ios" || laidOut === undefined) setLaidOut(height);
    },
    /** For the bar whose height this is (see `heightNow`). */
    bar,
    /**
     * Sending made the composer `by` shorter, seen on the UI thread the
     * frame it happened (a worklet). Its layout reaches JavaScript only
     * once the render of the message sent is done, and the list's room
     * shrinking then, after the messages had started to move, pulled them
     * back down.
     */
    onSentShorter: (by: number) => {
      "worklet";
      const height = heightNow(live.get() - by);
      // `onHeight` got there first: the room has the new height already.
      if (Math.abs(height - live.get()) < 0.5) return;
      sent.set(true);
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
    /** The list's room (see `ComposerHeight`), for the field's glass. */
    room,
    /** Attachments started to open or close, a height at a time. */
    onAttachmentsMove: () => {
      stepsUntil.set(Date.now() + ATTACHMENTS_MOVE_MS);
    },
  };
  return {
    composerHeight: { laidOut, live, room, sent, stepsUntil },
    report,
  };
}

/**
 * The list's room for the composer on iOS (`extraContentPadding`,
 * `ComposerHeight`'s `room`). It takes each height the composer reports at
 * once, as the composer itself changes, so a new line moves the messages
 * with it. Sending makes the composer shorter before the message sent is
 * in the list (they're separate renders): the room waits for the messages
 * to start making room for it (`moving`, for `GrowthProvider`), then
 * closes with them (`GROW_MS`), so the two are one move rather than down,
 * then up. Attachments opening or closing reach the UI thread a height at
 * a time, and jumping to each moved the list in steps: it eases to those.
 * It starts from the composer's own height on the UI thread: `live`, read
 * on the JavaScript thread as the list mounts, can still be 0, which left
 * the newest messages under the composer and the keyboard, out of reach.
 * On Android the composer is a row instead (`composerRow`).
 */
export function useComposerRoom({
  live,
  room,
  sent,
  stepsUntil,
}: ComposerHeight) {
  // Counts the rows' moves as they start (see `Growth`).
  const moving = useSharedValue(0);
  // A send's new height, until the messages start to move for it.
  const waiting = useSharedValue<number | null>(null);
  function close(to: number) {
    "worklet";
    waiting.set(null);
    room.set(withTiming(to, { duration: GROW_MS, easing: GROW_EASING }));
  }
  useAnimatedReaction(
    () => (IOS ? live.get() : 0),
    (now, before) => {
      if (before === null) room.set(now);
      else if (now === before) return;
      else if (sent.get()) {
        sent.set(false);
        waiting.set(now);
        // Nothing may move for it (it went in off screen): it closes anyway.
        let frames = 0;
        function wait() {
          if (waiting.get() !== now) return;
          frames += 1;
          if (frames < SEND_WAIT_FRAMES) requestAnimationFrame(wait);
          else close(now);
        }
        requestAnimationFrame(wait);
      } else {
        waiting.set(null);
        room.set(
          Date.now() < stepsUntil.get()
            ? withTiming(now, { duration: COMPOSER_EASE_MS })
            : now,
        );
      }
    },
  );
  useAnimatedReaction(
    () => moving.get(),
    (now, before) => {
      const to = waiting.get();
      if (before !== null && now !== before && to !== null) close(to);
    },
  );
  return {
    room,
    moving,
    /** Whether the room is the composer's height, not closing or waiting. */
    settled: () => {
      "worklet";
      return room.get() === live.get();
    },
  };
}

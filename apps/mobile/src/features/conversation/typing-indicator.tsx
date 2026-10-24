import type { ReactNode } from "react";
import type { SharedValue } from "react-native-reanimated";
import { useState } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type { Becoming } from "./arrive";
import type { MessageRow } from "./build-rows";
import type { ProfileOf } from "./message-row";
import type { Newest, TypingSeen } from "./typing-change";
import type { MessageLayout } from "~/features/preferences/store";
import { useGrowth } from "./grow";
import { useHeldHeight } from "./held-height";
import {
  anyPending,
  GROW_EASING,
  GROW_MS,
  inFrame,
  land,
  moved,
  showWithRoom,
  startMove,
} from "./moves";
import { typingChange } from "./typing-change";
import { Indicator, useOnMount } from "./typing-parts";
import { morphs, TYPING_ORDER } from "./typing-row";
import { typingSpaceHeight } from "./typing-space";

// Who's typing, as the newest row of the list, under the newest message,
// like Messages: it opens as the first person starts, and stays the last
// row as messages arrive above it, changing in place as people start and
// stop. It goes as the last one stops, shrinking away as the messages
// come back down, or, when they sent something, into what they sent. In a
// thread too short to reach the composer, it waits down by the composer
// instead (see `useTypingDrop`).

/** Fading under the message it became, in stacked rows. */
const BECOME_MS = 320;
/** Frames a message that takes its place has to take it. */
const HANDOFF_FRAMES = 8;

/** Bubbles grow from and shrink to where incoming ones are anchored. */
function originOf(layout: MessageLayout) {
  return layout === "stacked" ? "left center" : "left bottom";
}

/**
 * Fades and grows in from its corner as it mounts, as the messages clear
 * its place.
 */
function Appearing({
  layout,
  children,
}: {
  layout: MessageLayout;
  children: ReactNode;
}) {
  const shown = useSharedValue(0);
  useOnMount(() => {
    "worklet";
    shown.set(showWithRoom());
  });
  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ scale: 0.75 + 0.25 * shown.get() }],
  }));
  return (
    <Animated.View
      className="absolute inset-x-0 bottom-0"
      // Fading as one (see `SendingFade`).
      needsOffscreenAlphaCompositing
      style={[{ transformOrigin: originOf(layout) }, style]}
    >
      {children}
    </Animated.View>
  );
}

/** An indicator that ended, showing as it goes (see `typingChange`). */
export interface Ghost {
  key: string;
  typists: readonly string[];
  /** The message it became, when the last one typing sent it. */
  became?: Becoming & { key: string };
}

/**
 * What showed, after the last one stopped without sending: it shrinks
 * back into its corner and fades, going down with the messages as its
 * space closes.
 */
function Leaving({
  layout,
  onDone,
  children,
}: {
  layout: MessageLayout;
  onDone: () => void;
  children: ReactNode;
}) {
  const shown = useSharedValue(1);
  const down = typingSpaceHeight(layout, true);
  useOnMount(() => {
    "worklet";
    shown.set(
      withTiming(0, { duration: GROW_MS, easing: GROW_EASING }, (finished) => {
        if (finished === true) scheduleOnRN(onDone);
      }),
    );
  });
  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [
      { translateY: down * (1 - shown.get()) },
      { scale: 0.75 + 0.25 * shown.get() },
    ],
  }));
  return (
    <Animated.View
      className="absolute inset-x-0 bottom-0"
      // Fading as one (see `SendingFade`).
      needsOffscreenAlphaCompositing
      style={[{ transformOrigin: originOf(layout) }, style]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * What showed, after the last one typing sent a message: it stays until
 * the message opens in its place (see `Arrive`), in the same frame, then
 * hides as the message grows out of it, or fades under it.
 */
function HandingOff({
  morph,
  space,
  onDone,
  children,
}: {
  morph: boolean;
  space: SharedValue<number>;
  onDone: () => void;
  children: ReactNode;
}) {
  const shown = useSharedValue(1);
  useAnimatedReaction(
    () => space.get() === 0,
    (taken, before) => {
      if (!taken || before === true) return;
      shown.set(
        withTiming(0, { duration: morph ? 0 : BECOME_MS }, (finished) => {
          if (finished === true) scheduleOnRN(onDone);
        }),
      );
    },
  );
  // In the layout commit, so it goes in the frame the message opens.
  const style = useAnimatedStyle(() => ({
    backfaceVisibility: "visible",
    opacity: shown.get(),
  }));
  return (
    <Animated.View
      className="absolute inset-x-0 bottom-0"
      needsOffscreenAlphaCompositing
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/**
 * The indicator's place at the bottom of its row, drawn down by the
 * composer in a thread with room under its replies (see `useTypingDrop`).
 * That changes with the room as rows open and close, so it lands in their
 * layout commit, as the moves do (see `Move`).
 */
function Dropped({ children }: { children: ReactNode }) {
  const growth = useGrowth();
  const style = useAnimatedStyle(() =>
    moved(growth.typingDrop.get(), anyPending(growth.moves)),
  );
  return (
    <Animated.View
      pointerEvents="none"
      className="absolute inset-x-0 bottom-0"
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Who's typing, and who just stopped (`ghosts`), as the typing row shows
 * them, and the message that takes its place when the last one typing
 * sends it (`becoming`). Not while it's `dropped` down by the composer
 * (see `useTypingDrop`): the message opens under the newest reply, away
 * from it, so it comes in as any other does, and the indicator goes.
 */
export function useTypingRow({
  typists,
  newest,
  rows,
  layout,
}: {
  typists: readonly string[];
  newest: Newest | undefined;
  rows: readonly MessageRow[];
  layout: MessageLayout;
}) {
  const { typingDropped: dropped } = useGrowth();
  const [seen, setSeen] = useState<TypingSeen>({
    newestKey: newest?.key,
    typists,
  });
  const [ghosts, setGhosts] = useState<readonly Ghost[]>([]);
  const change = typingChange(seen, newest, typists);
  if (change !== undefined) {
    setSeen(change.seen);
    const { left } = change;
    if (left !== undefined) {
      const message = rows[0];
      const became =
        left.became && !dropped && message?.type === "message"
          ? { key: message.key, morphs: morphs(message.message, layout) }
          : undefined;
      // The same change again so soon replaces the one still going.
      const others = ghosts.filter((ghost) => ghost.key !== left.key);
      setGhosts([...others, { became, key: left.key, typists: left.typists }]);
    }
  }
  const becoming = ghosts.find((ghost) => ghost.became !== undefined)?.became;
  return {
    /** What the message at `key` becomes, if it takes the indicator's place. */
    becomingOf: (key: string) => (becoming?.key === key ? becoming : undefined),
    ghosts,
    removeGhost: (ghost: Ghost) =>
      setGhosts((all) => all.filter((each) => each !== ghost)),
  };
}

/**
 * The list's newest row: room under the newest message for who's typing,
 * with the indicator in it. Its space opens to fit the indicator as the
 * first person starts, the messages above making room (see `Move`), and
 * closes as the last one stops, unless what they sent takes it (see
 * `Arrive`). The indicator sits at its bottom, so it stays put as its
 * space opens and closes, and as messages open above it. In a thread with
 * room under its replies, it's drawn down by the composer instead (see
 * `useTypingDrop`), and stays put there as replies open above it.
 */
export function TypingRow({
  typists,
  typing: { ghosts, removeGhost: onGhostDone },
  layout,
  profileOf,
  showFaces,
}: {
  /** Who's typing, in the order they started. */
  typists: readonly string[];
  /** Who just stopped (see `useTypingRow`). */
  typing: Pick<ReturnType<typeof useTypingRow>, "ghosts" | "removeGhost">;
  layout: MessageLayout;
  profileOf: ProfileOf;
  /** Photos beside the bubble: in groups, as beside their messages. */
  showFaces: boolean;
}) {
  const growth = useGrowth();
  const row = useAnimatedRef<View>();
  const room = useAnimatedRef<View>();
  const typing = typists.length > 0;
  // Drawn down by the composer in a thread with room under its replies
  // (see `useTypingDrop`), it needs no room of its own under the newest
  // reply: someone starting or stopping then moves nothing there.
  const height = typingSpaceHeight(layout, typing && !growth.typingDropped);
  // A message that takes its place closes the space itself.
  const handingOff =
    !typing && ghosts.some((ghost) => ghost.became !== undefined);
  const started = useSharedValue(false);
  useAnimatedReaction(
    () => height,
    (now) => {
      // Already typing as the row first shows: just there.
      if (!started.get()) {
        started.set(true);
        growth.typing.set(now);
        return;
      }
      function close() {
        const delta = now - growth.typing.get();
        if (delta === 0) return;
        growth.typing.set(now);
        const move = startMove(
          growth,
          { order: TYPING_ORDER, place: 0 },
          delta,
          row,
        );
        land({ height: now, measured: room, move });
      }
      if (!handingOff) {
        inFrame(close);
        return;
      }
      // If no message takes it after all, it closes on its own.
      let frames = 0;
      function wait() {
        frames += 1;
        if (frames < HANDOFF_FRAMES) requestAnimationFrame(wait);
        else close();
      }
      requestAnimationFrame(wait);
    },
    [height, handingOff],
  );
  const space = useHeldHeight(growth.typing);
  function people(accounts: readonly string[]) {
    return accounts.map((address) => ({ address, ...profileOf(address) }));
  }
  function indicator(accounts: readonly string[]) {
    return (
      <Indicator
        people={people(accounts)}
        layout={layout}
        showFaces={showFaces}
      />
    );
  }
  return (
    <View ref={row} collapsable={false}>
      <Animated.View ref={room} style={space} />
      <Dropped>
        {ghosts.map((ghost) =>
          ghost.became === undefined ? (
            <Leaving
              key={ghost.key}
              layout={layout}
              onDone={() => onGhostDone(ghost)}
            >
              {indicator(ghost.typists)}
            </Leaving>
          ) : (
            <HandingOff
              key={ghost.key}
              morph={ghost.became.morphs}
              space={growth.typing}
              onDone={() => onGhostDone(ghost)}
            >
              {indicator(ghost.typists)}
            </HandingOff>
          ),
        )}
        {typing && <Appearing layout={layout}>{indicator(typists)}</Appearing>}
      </Dropped>
    </View>
  );
}

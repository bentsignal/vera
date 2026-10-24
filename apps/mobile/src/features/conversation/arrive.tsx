import type { ReactNode } from "react";
import type { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { createContext, use, useState } from "react";
import Animated, {
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useCSSVariable } from "uniwind";

import { inNextFrame } from "~/lib/next-frame";
import { Fading } from "./fading";
import { useGrowth } from "./grow";
import { GROW_EASING, GROW_MS, inFrame, land, startMove } from "./moves";
import { useOnMount } from "./typing-parts";

/** How long a message that comes in takes to fade in as it opens. */
const FADE_MS = 400;
/**
 * How far below its place a message rising in shows, fading in from the
 * background: within the gap above who's typing (see `BUBBLE_SPACE`,
 * `STACKED_SPACE`), so there's no line it's cut off at.
 */
const EMERGE = 10;
/** Frames to wait for a new row to be laid out before it opens. */
const MEASURE_TRIES = 30;
/** Its height while closed, and once open, its own again. */
const CLOSED = 0;
const OWN = -1;

/**
 * Rows that already played their arrival, so a row that scrolls out of the
 * list's window and back doesn't play it again, with what each became as
 * it arrived: the indicator it took the place of is gone a frame or two
 * later, long before its text has faded in (see `GrowingText`).
 */
const arrived = new Map<string, Becoming | undefined>();

/** A message taking the typing indicator's place (see `useTypingRow`). */
export interface Becoming {
  /** Its bubble grows out of the indicator's (see `BubbleMorph`). */
  morphs: boolean;
}

/** Set inside a message whose bubble grows out of the typing indicator. */
const BecomingContext = createContext(false);

/** Whether this message's bubble grows out of the typing indicator. */
export function useBecoming() {
  return use(BecomingContext);
}

/**
 * How a message that comes in while the conversation is open appears,
 * like Messages: it opens right where it belongs, above whoever is still
 * typing, and fades in as the messages above make room (see `Move`).
 * Nothing scrolls, so nothing below it moves.
 *
 * It mounts closed and hidden, is measured, then opens to its height in
 * one frame with the moves that make room. When it takes the place of the
 * typing indicator (`becoming`), that space closes in the same frame, and
 * it shows at once, growing out of the indicator in bubbles.
 */
/**
 * An opening row's `height` (`CLOSED`, a height, then `OWN`), how much of
 * it is `shown`, and its styles: its own box (`style`), what shows of it
 * (`window`), and what's in it (`content`). Once it's open, React draws
 * them open too (see `useOpened`), told by `laidOut` and `fadedIn`.
 */
function useOpenStyles() {
  const height = useSharedValue(CLOSED);
  const shown = useSharedValue(0);
  const { opened: open, laidOut, fadedIn } = useOpened();
  // Its height and how much it shows change together, in the same layout
  // commit as the moves (see `Move`).
  const style = useAnimatedStyle(() => ({
    // eslint-disable-next-line vera/no-layout-animation -- Not animated: it opens once, in the same frame as the moves, which do the moving.
    height: height.get() === OWN ? "auto" : height.get(),
    opacity: shown.get(),
  }));
  // What shows of it while it's closed or rising: its own place and the
  // fade under it (`EMERGE`); then all of it, as tall as what's in it.
  const window = useAnimatedStyle(() =>
    height.get() === OWN
      ? { height: "auto", overflow: "visible" }
      : { height: height.get() + EMERGE, overflow: "hidden" },
  );
  // Laid out on its own while closed, as a closed row would squeeze it to
  // nothing; back in the row once it's open, in the same commit.
  const content = useAnimatedStyle(() => ({
    position: height.get() === OWN ? "relative" : "absolute",
  }));
  return {
    height,
    shown,
    laidOut,
    fadedIn,
    content: [content, open && OPEN.content],
    style: [style, open && OPEN.style],
    window: [window, open && OPEN.window],
  };
}

/**
 * An open row's styles, as React draws them (see `useOpened`): the same as
 * `useOpenStyles` gives once it's open and has faded in.
 */
const OPEN = {
  content: { position: "relative" },
  style: { height: "auto", opacity: 1 },
  window: { height: "auto", overflow: "visible" },
} as const;

/**
 * Whether the row is open and has faded in, for React: from then on it
 * draws the row open itself (`OPEN`), not only through its animated styles.
 *
 * React's own props for an animated view are the styles it first rendered
 * with, here closed and hidden. Reanimated draws the animated values over
 * them, and a second after they last change it copies them back into
 * React, on the JavaScript thread. Two seconds after, it forgets them,
 * copied or not. When that thread is too busy to copy them in between
 * (several messages arriving at once), the row's next render puts its
 * first styles back: 0 tall and transparent, a message gone from the list
 * until it's opened again.
 */
function useOpened() {
  const [opened, setOpened] = useState(false);
  // With the others opening now: several arrive together in a busy
  // conversation (see `inNextFrame`).
  function markOpened() {
    inNextFrame(() => setOpened(true));
  }
  // Each step once: laid out at its own height, and faded in.
  const laidOut = useSharedValue(false);
  const fadedIn = useSharedValue(false);
  function settle() {
    "worklet";
    if (laidOut.get() && fadedIn.get()) scheduleOnRN(markOpened);
  }
  return {
    opened,
    /** It's as tall as what's in it now. */
    laidOut: () => {
      "worklet";
      if (laidOut.get()) return;
      laidOut.set(true);
      settle();
    },
    /** It has faded in. */
    fadedIn: () => {
      "worklet";
      if (fadedIn.get()) return;
      fadedIn.set(true);
      settle();
    },
  };
}

function Opening({
  order,
  becoming,
  children,
}: {
  order: number;
  becoming: Becoming | undefined;
  children: ReactNode;
}) {
  const growth = useGrowth();
  const taking = becoming !== undefined;
  const morphs = becoming?.morphs === true;
  const outer = useAnimatedRef<View>();
  const inner = useAnimatedRef<View>();
  const { height, shown, laidOut, fadedIn, style, window, content } =
    useOpenStyles();
  // How far below its place it's drawn, rising with the messages above.
  const rise = useSharedValue(0);
  const rising = useSharedValue(false);
  useOnMount(() => {
    "worklet";
    let tries = 0;
    function open() {
      const box = measure(inner);
      if (box === null && tries < MEASURE_TRIES) {
        tries += 1;
        requestAnimationFrame(open);
        return;
      }
      const natural = box?.height ?? 0;
      let delta = natural;
      if (taking) {
        delta -= growth.typing.get();
        growth.typing.set(0);
      }
      height.set(natural);
      // Growing out of the indicator, it's there at once.
      shown.set(withTiming(1, { duration: morphs ? 0 : FADE_MS }, fadedIn));
      const move = startMove(
        growth,
        { order, place: 0, whole: true },
        delta,
        outer,
      );
      // Under the messages above as they make room, it rises with them
      // out of its space, fading in out of the gap below it and hidden
      // past that, so it never covers them or who's typing below. One that takes the indicator's place
      // is already where it belongs.
      const rises = move !== undefined && !taking;
      // Once open and still, it's as tall as what's in it, as that
      // changes, and nothing cuts it off.
      function release() {
        height.set(OWN);
        laidOut();
      }
      if (rises) {
        rising.set(true);
        rise.set(delta);
        requestAnimationFrame(() => {
          rise.set(
            withTiming(
              0,
              { duration: GROW_MS, easing: GROW_EASING },
              // Even cut short, so it never stays a fixed height.
              () => release(),
            ),
          );
        });
      }
      land({
        done: () => {
          rising.set(false);
          if (!rises) release();
        },
        height: natural,
        measured: outer,
        move,
      });
    }
    inFrame(open);
  });
  // In the layout commit with the opening, then on the fast path.
  const risen = useAnimatedStyle(() => {
    const moved = { transform: [{ translateY: rise.get() }] };
    return rising.get() ? { ...moved, backfaceVisibility: "visible" } : moved;
  });
  return (
    <Animated.View
      ref={outer}
      // Fading in as one (see `SendingFade`).
      needsOffscreenAlphaCompositing
      style={style}
    >
      <Animated.View style={window}>
        <Animated.View style={risen}>
          <Animated.View
            ref={inner}
            collapsable={false}
            className="inset-x-0 top-0"
            style={content}
          >
            <Fading opacity={shown}>
              <BecomingContext value={morphs}>{children}</BecomingContext>
            </Fading>
          </Animated.View>
        </Animated.View>
        <Fade rise={rise} />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The band under a message rising in, from clear to the background, that
 * it comes up out of (see `EMERGE`).
 */
function Fade({ rise }: { rise: SharedValue<number> }) {
  const color = useCSSVariable("--color-background");
  // Gone as its last bit clears the fade.
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, rise.get()) }));
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) {
    return null;
  }
  return (
    <Animated.View
      pointerEvents="none"
      className="absolute inset-x-0 bottom-0"
      style={[
        {
          experimental_backgroundImage: `linear-gradient(180deg, ${color}00 0%, ${color} 100%)`,
          height: EMERGE,
        },
        style,
      ]}
    />
  );
}

/** A row that came in while the conversation is open: it opens, once. */
export function Arrive({
  rowKey,
  order,
  becoming,
  children,
}: {
  /** The row's key, so it arrives once. */
  rowKey: string;
  /** The row's order (see `rowOrder`). */
  order: number;
  /** It takes the typing indicator's place (see `Opening`). */
  becoming: Becoming | undefined;
  children: ReactNode;
}) {
  const [first] = useState(() => !arrived.has(rowKey));
  if (!arrived.has(rowKey)) arrived.set(rowKey, becoming);
  if (!first) return children;
  return (
    <Opening order={order} becoming={arrived.get(rowKey)}>
      {children}
    </Opening>
  );
}

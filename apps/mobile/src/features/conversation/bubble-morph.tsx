import type { ReactNode } from "react";
import type { SharedValue } from "react-native-reanimated";
import { useState } from "react";
import { View } from "react-native";
import Animated, {
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { BUBBLE_RADIUS, BubbleTail } from "./bubble-shape";
import { GROW_EASING } from "./moves";
import { Dots, useOnMount } from "./typing-parts";
import { BUBBLE_SPACE } from "./typing-space";

// A message growing out of the typing bubble it takes the place of (see
// `Arrive`): the bubble stretches from the indicator's size to the
// message's, anchored at its tail, as the dots fade; then the text fades in.

/**
 * How long the bubble takes to grow to the message's size: quick, as the
 * text waits for it.
 */
const MORPH_MS = 320;
const MORPH = { duration: MORPH_MS, easing: GROW_EASING };
/** The dots are gone by a third of the way. */
const DOTS_OUT = 3;
/** The text fades in once the bubble is its size, so it never spills out. */
const TEXT_IN = { delay: MORPH_MS, duration: 220 };

/** The typing bubble it starts as. */
const FROM = { height: BUBBLE_SPACE.bubble, width: BUBBLE_SPACE.width };
/**
 * The corners' radius: half the typing bubble's height, so it starts as
 * the same capsule. A message's own corners are a point rounder, too
 * little to see.
 */
const R = FROM.height / 2;

/** Where a size or place is at `grown`, from `from` (as the typing bubble) to `to`. */
function between(from: number, to: number, grown: number) {
  "worklet";
  return from + (to - from) * grown;
}

/** `from` over `to`, guarding a size too small to scale. */
function ratio(from: number, to: number) {
  "worklet";
  return to < 1 ? 1 : from / to;
}

/** The bubble's measured size, and how far it has grown (0 to 1). */
interface Growth {
  size: SharedValue<{ width: number; height: number }>;
  grown: SharedValue<number>;
}

/** The band across the middle, between the top and bottom corners. */
function useBand({ size, grown }: Growth) {
  return useAnimatedStyle(() => {
    const { width, height } = size.get();
    const at = grown.get();
    return {
      transform: [
        { scaleX: between(ratio(FROM.width, width), 1, at) },
        { scaleY: between(ratio(FROM.height - 2 * R, height - 2 * R), 1, at) },
      ],
    };
  });
}

/** The column down the middle, between the left and right corners. */
function useColumn({ size, grown }: Growth) {
  return useAnimatedStyle(() => {
    const { width, height } = size.get();
    const at = grown.get();
    return {
      transform: [
        { scaleX: between(ratio(FROM.width - 2 * R, width - 2 * R), 1, at) },
        { scaleY: between(ratio(FROM.height, height), 1, at) },
      ],
    };
  });
}

/**
 * A round corner, starting where it was on the typing bubble: the right
 * ones closer in, the top ones lower.
 */
function Corner({
  fill,
  right,
  top,
  growth: { size, grown },
}: {
  fill: string;
  right: boolean;
  top: boolean;
  growth: Growth;
}) {
  const style = useAnimatedStyle(() => {
    const { width, height } = size.get();
    const at = grown.get();
    return {
      transform: [
        { translateX: right ? between(FROM.width - width, 0, at) : 0 },
        { translateY: top ? between(height - FROM.height, 0, at) : 0 },
      ],
    };
  });
  return (
    <Animated.View
      className="absolute rounded-full"
      style={[
        {
          backgroundColor: fill,
          height: 2 * R,
          width: 2 * R,
          ...(right ? { right: 0 } : { left: 0 }),
          ...(top ? { top: 0 } : { bottom: 0 }),
        },
        style,
      ]}
    />
  );
}

/**
 * The bubble's background while it grows out of the typing bubble, from
 * its bottom left, where the tail is: a band and a column that stretch,
 * and four round corners that move apart, as the dots fade. Only
 * transforms and opacity move, so nothing is laid out again. It starts on
 * the frame after it mounts, as the message opens (see `Arrive`); `onDone`
 * once it's the message's size.
 */
export function BubbleMorph({
  fill,
  onDone,
}: {
  fill: string;
  onDone: () => void;
}) {
  const box = useAnimatedRef<View>();
  const size = useSharedValue({ height: FROM.height, width: FROM.width });
  const grown = useSharedValue(0);
  const growth = { grown, size };
  useOnMount(() => {
    "worklet";
    const measured = measure(box);
    if (measured !== null) {
      size.set({ height: measured.height, width: measured.width });
    }
    requestAnimationFrame(() => {
      grown.set(
        withTiming(1, MORPH, (finished) => {
          if (finished === true) scheduleOnRN(onDone);
        }),
      );
    });
  });
  const band = useBand(growth);
  const column = useColumn(growth);
  const dots = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - grown.get() * DOTS_OUT),
  }));
  return (
    <View ref={box} pointerEvents="none" className="absolute inset-0">
      <Animated.View
        className="absolute inset-x-0"
        style={[
          {
            backgroundColor: fill,
            bottom: R,
            top: R,
            transformOrigin: "left bottom",
          },
          band,
        ]}
      />
      <Animated.View
        className="absolute inset-y-0"
        style={[
          {
            backgroundColor: fill,
            left: R,
            right: R,
            transformOrigin: "left bottom",
          },
          column,
        ]}
      />
      <Corner fill={fill} right={false} top={false} growth={growth} />
      <Corner fill={fill} right top={false} growth={growth} />
      <Corner fill={fill} right={false} top growth={growth} />
      <Corner fill={fill} right top growth={growth} />
      <Animated.View
        className="absolute"
        style={[
          {
            bottom: (FROM.height - 8) / 2,
            left: (FROM.width - 32) / 2,
          },
          dots,
        ]}
      >
        <Dots size={8} gap={4} />
      </Animated.View>
    </View>
  );
}

/**
 * What's drawn under a bubble's text: its tail when it ends a run, and,
 * as it grows out of the typing bubble (`morphing`), its background, then
 * once it has (`grew`), a plain rounded one. That's a view of its own,
 * mounted with its color: Android loses the corners of a view whose
 * background is added after it's drawn, squaring the bubble.
 */
export function BubbleBackdrop({
  fill,
  isOwn,
  tail,
  grew,
  morphing,
  onMorphed,
}: {
  fill: string | undefined;
  isOwn: boolean;
  tail: boolean;
  grew: boolean;
  morphing: boolean;
  onMorphed: () => void;
}) {
  if (fill === undefined) return null;
  return (
    <>
      {morphing && <BubbleMorph fill={fill} onDone={onMorphed} />}
      {grew && (
        <View
          pointerEvents="none"
          className="absolute inset-0"
          style={{
            backgroundColor: fill,
            borderRadius: BUBBLE_RADIUS,
          }}
        />
      )}
      {tail && <BubbleTail color={fill} isOwn={isOwn} />}
    </>
  );
}

/**
 * Text that fades in once its bubble has grown (see `BubbleMorph`). Once
 * it has, its opacity goes back to React, so nothing it's drawn with
 * later can hide it again.
 */
function FadingText({ children }: { children: ReactNode }) {
  const [shownFully, setShownFully] = useState(false);
  const shown = useSharedValue(0);
  useOnMount(() => {
    "worklet";
    requestAnimationFrame(() => {
      shown.set(
        withDelay(
          TEXT_IN.delay,
          withTiming(1, TEXT_IN, (finished) => {
            if (finished === true) scheduleOnRN(setShownFully, true);
          }),
        ),
      );
    });
  });
  const style = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return (
    <Animated.View style={shownFully ? undefined : style}>
      {children}
    </Animated.View>
  );
}

/** A bubble's text, fading in once the bubble has grown when `growing`. */
export function GrowingText({
  growing,
  children,
}: {
  growing: boolean;
  children: ReactNode;
}) {
  return growing ? <FadingText>{children}</FadingText> : children;
}

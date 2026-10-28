import { useState } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { LEVEL_COUNT, levelCount, levels, levelShift } from "./session";

const BAR = 3;
const GAP = 3;
const SPACING = BAR + GAP;
/** The tallest bar, for the loudest speech. */
const HEIGHT = 24;
/** Silence still shows, as a dotted line. */
const LEAST = BAR / HEIGHT;

/**
 * Bar `index` of the ring: it shows each level that lands at its place in
 * `levels`, at that level's place along the strip. A new level moves only
 * the bar it lands on, from the far left (out of sight) to the right
 * end, so nothing else is redrawn as levels come in.
 */
function WaveBar({ index }: { index: number }) {
  const style = useAnimatedStyle(() => {
    const newest = levelCount.get() - 1;
    // The newest level that's this bar's: one of every LEVEL_COUNT.
    const behind =
      (((newest - index) % LEVEL_COUNT) + LEVEL_COUNT) % LEVEL_COUNT;
    const level = levels.get()[index] ?? 0;
    return {
      transform: [
        { translateX: (newest - behind) * SPACING },
        { scaleY: Math.max(LEAST, level) },
      ],
    };
  });
  return (
    <Animated.View
      className="bg-foreground absolute top-0 left-0 rounded-full"
      style={[{ height: HEIGHT, width: BAR }, style]}
    />
  );
}

/**
 * The microphone's level over the last few seconds, newest at the right.
 * The strip slides steadily left as each level comes in (see
 * `levelShift`): one transform a frame, however many bars show.
 */
export function Waveform() {
  const [width, setWidth] = useState(0);
  const strip = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          width -
          BAR -
          (levelCount.get() - 1) * SPACING +
          levelShift.get() * SPACING,
      },
    ],
  }));
  return (
    <View
      className="flex-1 overflow-hidden"
      style={{ height: HEIGHT }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityLabel="Listening"
    >
      <Animated.View
        style={[
          { height: HEIGHT, left: 0, position: "absolute", top: 0 },
          strip,
        ]}
      >
        {Array.from({ length: LEVEL_COUNT }, (_, index) => (
          <WaveBar key={index} index={index} />
        ))}
      </Animated.View>
    </View>
  );
}

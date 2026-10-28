import { useState } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { LEVEL_COUNT, levels, levelShift } from "./session";

const BAR = 3;
const GAP = 3;
const SPACING = BAR + GAP;
/** The tallest bar, for the loudest speech. */
const HEIGHT = 24;
/** Silence still shows, as a dotted line. */
const LEAST = BAR / HEIGHT;
/** The oldest bars fade out over this many. */
const FADE_BARS = 8;

/**
 * One bar, `fromNewest` places back from the newest level. It changes
 * only its scale, so nothing is laid out as the waveform moves.
 */
function WaveBar({ fromNewest }: { fromNewest: number }) {
  const style = useAnimatedStyle(() => {
    const list = levels.get();
    const level = list[list.length - 1 - fromNewest] ?? 0;
    return { transform: [{ scaleY: Math.max(LEAST, level) }] };
  });
  return (
    <Animated.View
      className="bg-foreground rounded-full"
      style={[{ height: HEIGHT, width: BAR }, style]}
    />
  );
}

/**
 * The microphone's level over the last few seconds, newest at the right,
 * sliding steadily left as each level comes in (see `levelShift`).
 */
export function Waveform() {
  const [width, setWidth] = useState(0);
  const count = Math.min(LEVEL_COUNT - 1, Math.ceil(width / SPACING) + 1);
  const strip = useAnimatedStyle(() => ({
    transform: [{ translateX: levelShift.get() * SPACING }],
  }));
  return (
    <View
      className="flex-1 justify-center overflow-hidden"
      style={{ height: HEIGHT }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityLabel="Listening"
    >
      <Animated.View
        style={[
          { flexDirection: "row", gap: GAP, position: "absolute", right: 0 },
          strip,
        ]}
      >
        {Array.from({ length: count }, (_, index) => {
          const fromNewest = count - 1 - index;
          const fromOldest = index;
          return (
            <View
              key={fromNewest}
              style={{ opacity: Math.min(1, (fromOldest + 1) / FADE_BARS) }}
            >
              <WaveBar fromNewest={fromNewest} />
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}

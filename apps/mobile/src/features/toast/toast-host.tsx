import { Platform, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  Keyframe,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassSurface } from "~/components/glass-surface";
import { useToast } from "./store";

/** iOS: drops in a little from above as its glass materializes. */
const DROP_IN = new Keyframe({
  0: { transform: [{ translateY: -8 }] },
  100: { transform: [{ translateY: 0 }] },
}).duration(220);

/**
 * The toast's capsule. On iOS its glass materializes and dissolves on its
 * own (a parent can't fade glass) while the text fades inside it, and it
 * moves a little: down as it comes, up as it goes. Android's solid capsule
 * fades.
 */
function Capsule({ message, shown }: { message: string; shown: boolean }) {
  const text = useAnimatedStyle(() => ({
    opacity: withTiming(shown ? 1 : 0, { duration: 180 }),
  }));
  const drop = useAnimatedStyle(() => ({
    transform: [{ translateY: withTiming(shown ? 0 : -6, { duration: 220 }) }],
  }));
  return (
    <Animated.View
      entering={Platform.OS === "android" ? FadeIn.duration(180) : DROP_IN}
      exiting={Platform.OS === "android" ? FadeOut.duration(160) : undefined}
    >
      <Animated.View style={drop}>
        <GlassSurface
          materialize
          shown={shown}
          className="rounded-full px-4 py-2.5"
          style={{ borderCurve: "continuous" }}
        >
          <Animated.View style={text}>
            <Animated.View entering={FadeIn.duration(200)}>
              <Text className="text-subhead text-foreground font-semibold">
                {message}
              </Text>
            </Animated.View>
          </Animated.View>
        </GlassSurface>
      </Animated.View>
    </Animated.View>
  );
}

/** Where toasts show: once, over the whole app. */
export function ToastHost() {
  const toast = useToast();
  const { top } = useSafeAreaInsets();
  return (
    <View
      pointerEvents="none"
      style={{
        alignItems: "center",
        left: 16,
        position: "absolute",
        right: 16,
        top: top + 8,
      }}
    >
      {toast !== undefined && (
        <Capsule key={toast.id} message={toast.message} shown={toast.shown} />
      )}
    </View>
  );
}

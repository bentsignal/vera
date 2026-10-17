import { Text, View } from "react-native";
import Animated, { useAnimatedReaction } from "react-native-reanimated";

import { Avatar } from "~/components/avatar";
import { typingFaces } from "~/features/messaging/typing-state";
import { cn } from "~/lib/cn";

// The pieces of a typing indicator (see `typing-indicator.tsx`).

/** One wave across the dots. */
const DOTS_MS = 1300;
/**
 * A dot brightens and swells a little for the first part of the wave and
 * rests for the rest. A CSS animation, which Reanimated runs natively: a
 * worklet run every frame for the dots dropped frames on Android.
 */
const PULSE = {
  "0%": { opacity: 0.35, transform: [{ scale: 0.85 }] },
  "25%": { opacity: 1, transform: [{ scale: 1.05 }] },
  "50%": { opacity: 0.35, transform: [{ scale: 0.85 }] },
  "100%": { opacity: 0.35, transform: [{ scale: 0.85 }] },
};

/** Starts on the frame the view mounts (no effect needed). */
export function useOnMount(start: () => void) {
  useAnimatedReaction(
    () => true,
    (_, previous) => {
      if (previous === null) start();
    },
  );
}

function Dot({ index, size }: { index: number; size: number }) {
  return (
    <Animated.View
      className="bg-muted rounded-full"
      style={{
        // Each dot's pulse comes a fifth of the wave after the one before.
        animationDelay: index * DOTS_MS * 0.2,
        animationDuration: DOTS_MS,
        animationIterationCount: "infinite",
        animationName: PULSE,
        animationTimingFunction: "ease-in-out",
        height: size,
        opacity: 0.35,
        width: size,
      }}
    />
  );
}

/** The three dots, each brightening in turn. */
export function Dots({ size, gap }: { size: number; gap: number }) {
  return (
    <View className="flex-row items-center" style={{ gap }}>
      <Dot index={0} size={size} />
      <Dot index={1} size={size} />
      <Dot index={2} size={size} />
    </View>
  );
}

export interface Person {
  address: string;
  avatarUrl: string | null;
  displayName: string;
}

/** Overlapping photos of who's typing, then how many more. */
export function Faces({
  people,
  size,
}: {
  people: readonly Person[];
  size: "sm" | "xs";
}) {
  const { faces, more } = typingFaces(people);
  const box = size === "sm" ? 28 : 18;
  const overlap = size === "sm" ? 6 : 4;
  // A ring in the page's color sets each photo off from the one under it.
  const ring = size === "sm" ? 2 : 1.5;
  return (
    <View className="flex-row items-center">
      {faces.map((person, index) => (
        <View
          key={person.address}
          className="border-background rounded-full"
          style={{
            borderWidth: ring,
            margin: -ring,
            marginLeft: index === 0 ? -ring : -overlap - ring,
            zIndex: faces.length - index,
          }}
        >
          <Avatar
            name={person.displayName}
            size={size}
            uri={person.avatarUrl}
          />
        </View>
      ))}
      {more > 0 && (
        <View
          className="border-background bg-bubble-incoming items-center justify-center rounded-full"
          style={{
            borderWidth: ring,
            height: box + ring * 2,
            margin: -ring,
            marginLeft: -overlap - ring,
            minWidth: box + ring * 2,
            paddingHorizontal: 4,
          }}
        >
          <Text
            className={cn(
              "text-muted font-semibold",
              size === "sm" ? "text-caption" : "text-[10px]",
            )}
          >
            +{more}
          </Text>
        </View>
      )}
    </View>
  );
}

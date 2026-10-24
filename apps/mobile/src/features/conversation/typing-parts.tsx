import { View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
  useAnimatedReaction,
  ZoomIn,
  ZoomOut,
} from "react-native-reanimated";
import { useCSSVariable } from "uniwind";

import type { MessageLayout } from "~/features/preferences/store";
import { Avatar } from "~/components/avatar";
import { typingFaces, typingLabel } from "~/features/messaging/typing-state";
import { cn } from "~/lib/cn";
import { BUBBLE_RADIUS, BubbleTail } from "./bubble-shape";
import { BUBBLE_SPACE, STACKED_SPACE } from "./typing-space";

// What a typing indicator looks like (see `typing-indicator.tsx` for how
// it comes and goes).

/** How long a change to who's typing takes: a photo or name coming or going. */
const CHANGE_MS = 220;
/**
 * What moves over as someone joins or leaves, such as the bubble beside
 * the photos. Each view's own frame moves (Reanimated lays nothing else
 * out again), and only a few views do.
 */
const SHIFT = LinearTransition.duration(CHANGE_MS);
/** A name or count that changed, crossfading with the one before. */
const CHANGE_IN = FadeIn.duration(CHANGE_MS);
const CHANGE_OUT = FadeOut.duration(CHANGE_MS * 0.7);
const FACE_IN = ZoomIn.duration(CHANGE_MS);
const FACE_OUT = ZoomOut.duration(CHANGE_MS * 0.7);

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

/**
 * Overlapping photos of who's typing, then how many more. Someone joining
 * grows in at the end; someone leaving shrinks away as the rest close up.
 */
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
        <Animated.View
          key={person.address}
          entering={FACE_IN}
          exiting={FACE_OUT}
          layout={SHIFT}
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
        </Animated.View>
      ))}
      {more > 0 && (
        <Animated.View
          entering={FACE_IN}
          exiting={FACE_OUT}
          layout={SHIFT}
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
          <Animated.Text
            key={more}
            entering={CHANGE_IN}
            className={cn(
              "text-muted font-semibold",
              size === "sm" ? "text-caption" : "text-[10px]",
            )}
          >
            +{more}
          </Animated.Text>
        </Animated.View>
      )}
    </View>
  );
}

/** iMessage-style: a bubble of dots where their next message will be. */
function TypingBubble({
  people,
  showFaces,
}: {
  people: readonly Person[];
  showFaces: boolean;
}) {
  const incoming = useCSSVariable("--color-bubble-incoming");
  const fill = typeof incoming === "string" ? incoming : undefined;
  return (
    // The photos sit by the tail, as beside a group's messages.
    <View
      className="flex-row items-end gap-2.5 px-4"
      style={{ paddingTop: BUBBLE_SPACE.top }}
    >
      {showFaces && <Faces people={people} size="sm" />}
      <Animated.View
        layout={SHIFT}
        className="items-center justify-center"
        style={{
          backgroundColor: fill,
          borderRadius: BUBBLE_RADIUS,
          height: BUBBLE_SPACE.bubble,
          marginBottom: BUBBLE_SPACE.bottom,
          width: BUBBLE_SPACE.width,
        }}
      >
        {fill !== undefined && <BubbleTail color={fill} isOwn={false} />}
        <Dots size={8} gap={4} />
      </Animated.View>
    </View>
  );
}

/**
 * Their photos, who's typing, and the dots, in a row. A new name
 * crossfades with the old, and the dots move over with it.
 */
export function TypingSummary({
  people,
  label,
}: {
  people: readonly Person[];
  label: string;
}) {
  return (
    <>
      <Faces people={people} size="xs" />
      <Animated.View layout={SHIFT} className="shrink">
        <Animated.Text
          key={label}
          entering={CHANGE_IN}
          exiting={CHANGE_OUT}
          numberOfLines={1}
          className="text-footnote text-muted"
        >
          {label}
        </Animated.Text>
      </Animated.View>
      <Animated.View layout={SHIFT}>
        <Dots size={4} gap={2} />
      </Animated.View>
    </>
  );
}

/** Slack/Discord-style: who's typing, in a small line. */
function TypingLine({
  people,
  label,
}: {
  people: readonly Person[];
  label: string;
}) {
  return (
    <View
      className="flex-row items-center gap-2 px-4"
      style={{ height: STACKED_SPACE.line, marginTop: STACKED_SPACE.top }}
    >
      <TypingSummary people={people} label={label} />
    </View>
  );
}

export function Indicator({
  people,
  layout,
  showFaces,
}: {
  people: readonly Person[];
  layout: MessageLayout;
  showFaces: boolean;
}) {
  const label = typingLabel(people.map((person) => person.displayName));
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
    >
      {/* Its pieces animate only as people come and go, not as it
          appears or leaves, which it does as a whole. */}
      <LayoutAnimationConfig skipEntering skipExiting>
        {layout === "stacked" ? (
          <TypingLine people={people} label={label} />
        ) : (
          <TypingBubble people={people} showFaces={showFaces} />
        )}
      </LayoutAnimationConfig>
    </View>
  );
}

import type { ReactNode } from "react";
import { useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type { ProfileOf } from "./message-row";
import type { Person } from "./typing-parts";
import type { MessageLayout } from "~/features/preferences/store";
import { typingLabel } from "~/features/messaging/typing-state";
import { BUBBLE_RADIUS } from "./bubble-shape";
import { Dots, Faces, useOnMount } from "./typing-parts";
import { BUBBLE_SPACE, STACKED_SPACE, typingSpaceHeight } from "./typing-space";

// Who's typing, under the newest message. The list keeps a fixed space for
// it while anyone types (see `typing-space.ts`), so the messages move
// only when the first person starts and the last one stops, and the people
// in it change in place.

const APPEAR_MS = 220;
const LEAVE_MS = 160;

/**
 * iMessage-style: a bubble of dots where the next message will be, with
 * the photos of who's typing beside it in a group, and two small circles
 * trailing off its corner like a thought.
 */
function TypingBubble({
  people,
  showFaces,
}: {
  people: readonly Person[];
  showFaces: boolean;
}) {
  return (
    <View
      className="flex-row items-end gap-2.5 px-4"
      style={{ paddingTop: BUBBLE_SPACE.top }}
    >
      {showFaces && <Faces people={people} size="sm" />}
      <View style={{ height: BUBBLE_SPACE.bubble }}>
        <View
          className="bg-bubble-incoming absolute rounded-full"
          style={{ bottom: -3, height: 10, left: -2, width: 10 }}
        />
        <View
          className="bg-bubble-incoming absolute rounded-full"
          style={{ bottom: -7, height: 5, left: -7, width: 5 }}
        />
        <View
          className="bg-bubble-incoming flex-1 justify-center px-3.5"
          style={{ borderCurve: "continuous", borderRadius: BUBBLE_RADIUS }}
        >
          <Dots size={8} gap={4} />
        </View>
      </View>
    </View>
  );
}

/** Slack/Discord-style: their photos and who's typing, in a small line. */
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
      <Faces people={people} size="xs" />
      <Text numberOfLines={1} className="text-footnote text-muted shrink">
        {label}
      </Text>
      <Dots size={4} gap={2} />
    </View>
  );
}

function Indicator({
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
      {layout === "stacked" ? (
        <TypingLine people={people} label={label} />
      ) : (
        <TypingBubble people={people} showFaces={showFaces} />
      )}
    </View>
  );
}

/** Fades and grows in from its corner as it mounts. */
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
    shown.set(
      withTiming(1, {
        duration: APPEAR_MS,
        easing: Easing.out(Easing.cubic),
      }),
    );
  });
  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ scale: 0.8 + 0.2 * shown.get() }],
  }));
  return (
    <Animated.View
      style={[
        {
          // Bubbles grow from where the incoming ones are anchored.
          transformOrigin: layout === "stacked" ? "left center" : "left bottom",
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** What was showing, fading out over the space as it closes. */
function Leaving({
  onDone,
  children,
}: {
  onDone: () => void;
  children: ReactNode;
}) {
  const shown = useSharedValue(1);
  useOnMount(() => {
    "worklet";
    shown.set(
      withTiming(0, { duration: LEAVE_MS }, (finished) => {
        if (finished === true) scheduleOnRN(onDone);
      }),
    );
  });
  const style = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return (
    <Animated.View
      pointerEvents="none"
      className="absolute inset-x-0 top-0"
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/**
 * The space under the newest message while anyone types, with the
 * indicator in it. The first typist makes room for it, and the list
 * slides it into view as it does a new message (see `useLatest`); people
 * starting and stopping after that change it in place. When the last one
 * stops, it fades out as the space closes, unless their message arrived
 * with it: then that message takes its place, where it was, and the
 * indicator goes at once.
 */
export function TypingSpace({
  typists,
  layout,
  profileOf,
  showFaces,
  newestKey,
}: {
  /** Who's typing, in the order they started. */
  typists: readonly string[];
  layout: MessageLayout;
  profileOf: ProfileOf;
  /** Photos beside the bubble: in groups, as beside their messages. */
  showFaces: boolean;
  /** The newest row's key, to tell when a message came with the stop. */
  newestKey: string | undefined;
}) {
  const [last, setLast] = useState({ newestKey, typists });
  const [leaving, setLeaving] = useState<readonly string[] | null>(null);
  const typing = typists.length > 0;
  const changed =
    last.newestKey !== newestKey || last.typists.join() !== typists.join();
  if (changed) {
    setLast({ newestKey, typists });
    if (!typing && last.typists.length > 0) {
      setLeaving(last.newestKey === newestKey ? last.typists : null);
    } else if (typing && leaving !== null) {
      setLeaving(null);
    }
  }
  function people(accounts: readonly string[]) {
    return accounts.map((address) => ({ address, ...profileOf(address) }));
  }
  return (
    <View
      style={{ height: typingSpaceHeight(layout, typing), overflow: "visible" }}
    >
      {typing && (
        <Appearing layout={layout}>
          <Indicator
            people={people(typists)}
            layout={layout}
            showFaces={showFaces}
          />
        </Appearing>
      )}
      {leaving !== null && (
        <Leaving onDone={() => setLeaving(null)}>
          <Indicator
            people={people(leaving)}
            layout={layout}
            showFaces={showFaces}
          />
        </Leaving>
      )}
    </View>
  );
}

type BelowNewestProps = Parameters<typeof TypingSpace>[0] & {
  composerHeight: number;
};

/**
 * Everything under the newest message: who's typing, then room for the
 * composer floating over the bottom of the list.
 */
export function BelowNewest({ composerHeight, ...typing }: BelowNewestProps) {
  return (
    <View>
      <TypingSpace {...typing} />
      <View style={{ height: composerHeight + 8 }} />
    </View>
  );
}

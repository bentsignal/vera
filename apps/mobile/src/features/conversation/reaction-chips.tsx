import { Pressable, Text, View } from "react-native";
import Animated, { Easing, Keyframe, ZoomOut } from "react-native-reanimated";

import type { ReactionSummary } from "~/features/messaging/reactions";
import { Emoji } from "~/components/emoji";
import { GlassSurface } from "~/components/glass-surface";
import { cn } from "~/lib/cn";
import { useOpaque } from "./fading";
import { LONG_PRESS_MS } from "./message-actions";

/**
 * Reactions pop in when they arrive and shrink away when taken back. One
 * brief bump, about as long as the glass press feedback when you add to a
 * reaction someone else left, rather than a spring that wobbles for
 * seconds. Only the size changes: glass can't fade (see `GlassSurface`).
 */
const POP_IN = new Keyframe({
  0: { transform: [{ scale: 0 }] },
  60: {
    easing: Easing.out(Easing.cubic),
    transform: [{ scale: 1.06 }],
  },
  100: { easing: Easing.inOut(Easing.quad), transform: [{ scale: 1 }] },
}).duration(280);
const POP_OUT = ZoomOut.duration(140);

function Chip({
  reaction,
  onPress,
  onLongPress,
}: {
  reaction: ReactionSummary;
  onPress: () => void;
  onLongPress: () => void;
}) {
  // Its glass comes in once the message it's under is fully shown.
  const opaque = useOpaque();
  return (
    <Animated.View entering={POP_IN} exiting={POP_OUT}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${reaction.emoji} ${reaction.count}`}
        accessibilityState={{ selected: reaction.mine }}
        accessibilityHint="Hold to see who reacted"
        onPress={onPress}
        delayLongPress={LONG_PRESS_MS}
        onLongPress={onLongPress}
      >
        <GlassSurface
          // Brought in once laid out and once the message is fully shown:
          // glass there from the frame a chip mounts often stayed blank.
          materialize
          shown={opaque}
          isInteractive
          tintColorClassName={reaction.mine ? "accent-accent/25" : undefined}
          androidClassName={reaction.mine ? "bg-accent/20" : undefined}
          className="h-[26px] flex-row items-center gap-1 rounded-full px-2"
        >
          <Emoji emoji={reaction.emoji} size={13} />
          <Text
            className={cn(
              "text-footnote font-semibold",
              reaction.mine ? "text-accent" : "text-muted",
            )}
          >
            {reaction.count}
          </Text>
        </GlassSurface>
      </Pressable>
    </Animated.View>
  );
}

/** A chip's size and what's in it, with nothing drawn (see `ChipRow`). */
function GhostChip({ reaction }: { reaction: ReactionSummary }) {
  return (
    <View className="h-[26px] flex-row items-center gap-1 rounded-full px-2">
      <Emoji emoji={reaction.emoji} size={13} />
      <Text className="text-footnote font-semibold">{reaction.count}</Text>
    </View>
  );
}

/**
 * Slack's row, made quieter: small glass chips under the message, yours
 * tinted. Tap one to add or take back that reaction, hold it to see who
 * reacted with it; long press the message for more. A `ghost` row is laid
 * out the same with no glass, to measure it before the chips show.
 */
export function ChipRow({
  reactions,
  align,
  ghost = false,
  onToggle,
  onHold,
}: {
  reactions: readonly ReactionSummary[];
  align: "end" | "start";
  ghost?: boolean;
  onToggle: (emoji: string) => void;
  onHold: (emoji: string) => void;
}) {
  return (
    <View
      className={cn(
        "flex-row flex-wrap gap-1 pt-1",
        align === "end" ? "justify-end" : "justify-start",
      )}
    >
      {reactions.map((reaction) =>
        ghost ? (
          <GhostChip key={reaction.emoji} reaction={reaction} />
        ) : (
          <Chip
            key={reaction.emoji}
            reaction={reaction}
            onPress={() => onToggle(reaction.emoji)}
            onLongPress={() => onHold(reaction.emoji)}
          />
        ),
      )}
    </View>
  );
}

import { Pressable, Text, View } from "react-native";
import Animated, { ZoomIn, ZoomOut } from "react-native-reanimated";

import type { ReactionSummary } from "~/features/messaging/reactions";
import { GlassSurface } from "~/components/glass-surface";
import { cn } from "~/lib/cn";

/** Reactions pop in when they arrive and shrink away when taken back. */
export const POP_IN = ZoomIn.springify().damping(13).stiffness(260);
export const POP_OUT = ZoomOut.duration(140);

function Chip({
  reaction,
  onPress,
}: {
  reaction: ReactionSummary;
  onPress: () => void;
}) {
  return (
    <Animated.View entering={POP_IN} exiting={POP_OUT}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${reaction.emoji} ${reaction.count}`}
        accessibilityState={{ selected: reaction.mine }}
        onPress={onPress}
      >
        <GlassSurface
          isInteractive
          tintColorClassName={reaction.mine ? "accent-accent/25" : undefined}
          androidClassName={reaction.mine ? "bg-accent/20" : undefined}
          className="h-[26px] flex-row items-center gap-1 rounded-full px-2"
        >
          <Text style={{ fontSize: 13 }}>{reaction.emoji}</Text>
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

/**
 * Slack's row, made quieter: small glass chips under the message, yours
 * tinted. Tap one to add or take back that reaction; long press the message
 * for more.
 */
export function ChipRow({
  reactions,
  align,
  onToggle,
}: {
  reactions: readonly ReactionSummary[];
  align: "end" | "start";
  onToggle: (emoji: string) => void;
}) {
  return (
    <View
      className={cn(
        "flex-row flex-wrap gap-1 pt-1",
        align === "end" ? "justify-end" : "justify-start",
      )}
    >
      {reactions.map((reaction) => (
        <Chip
          key={reaction.emoji}
          reaction={reaction}
          onPress={() => onToggle(reaction.emoji)}
        />
      ))}
    </View>
  );
}

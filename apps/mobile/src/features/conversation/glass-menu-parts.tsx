import type { SymbolViewProps } from "expo-symbols";
import type { SharedValue } from "react-native-reanimated";
import { Pressable, Text, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
} from "react-native-reanimated";

import type { MenuTarget, TargetAlign } from "./glass-message-menu";
import { GlassSurface } from "~/components/glass-surface";
import { SymbolIcon } from "~/components/symbol-icon";
import { QUICK_REACTIONS } from "~/features/messaging/reactions";
import { cn } from "~/lib/cn";

const EMOJI = 44;
const BAR_PADDING = 5;
export const BAR_HEIGHT = EMOJI + BAR_PADDING * 2;
export const BAR_WIDTH = QUICK_REACTIONS.length * EMOJI + BAR_PADDING * 2;
const ROW_HEIGHT = 46;
/** The action menu's height for `rows` actions, inside its padding. */
export function menuHeight(rows: number) {
  return rows === 0 ? 0 : rows * ROW_HEIGHT + 12;
}
export const MENU_WIDTH = 230;

/** Pops out of the message's corner, then settles. */
function usePopStyle(
  progress: SharedValue<number>,
  from: "bottom" | "top",
  align: TargetAlign,
) {
  return useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.45], [0, 1], "clamp"),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.35, 1]) }],
    transformOrigin: `${align === "end" ? "right" : "left"} ${from === "top" ? "bottom" : "top"}`,
  }));
}

function EmojiButton({
  emoji,
  count,
  mine,
  onPress,
}: {
  emoji: string;
  count: number;
  mine: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`React ${emoji}`}
      accessibilityState={{ selected: mine }}
      onPress={onPress}
      className={cn(
        "items-center justify-center rounded-full",
        mine && "bg-accent/25",
      )}
      style={({ pressed }) => ({
        height: EMOJI,
        transform: [{ scale: pressed ? 1.2 : 1 }],
        width: EMOJI,
      })}
    >
      <Text style={{ fontSize: 27 }}>{emoji}</Text>
      {count > 0 && (
        <View className="bg-background-elevated absolute -right-0.5 -bottom-0.5 min-w-4 items-center rounded-full px-1">
          <Text
            className={cn(
              "text-[10px] font-bold",
              mine ? "text-accent" : "text-muted",
            )}
          >
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function ReactionBar({
  target,
  progress,
  position,
  onPick,
}: {
  target: MenuTarget;
  progress: SharedValue<number>;
  position: { left: number; top: number };
  onPick: (emoji: string) => void;
}) {
  const style = usePopStyle(progress, "top", target.align);
  return (
    <Animated.View
      className="absolute"
      style={[{ ...position, height: BAR_HEIGHT, width: BAR_WIDTH }, style]}
    >
      <GlassSurface
        isInteractive
        className="flex-1 flex-row items-center rounded-full"
        androidClassName="bg-background-elevated"
        style={{ paddingHorizontal: BAR_PADDING }}
      >
        {QUICK_REACTIONS.map((emoji) => {
          const reaction = target.message.reactions.find(
            (item) => item.emoji === emoji,
          );
          return (
            <EmojiButton
              key={emoji}
              emoji={emoji}
              count={reaction?.count ?? 0}
              mine={reaction?.mine ?? false}
              onPress={() => onPick(emoji)}
            />
          );
        })}
      </GlassSurface>
    </Animated.View>
  );
}

/** One row in the action menu under a lifted message. */
export interface MenuAction {
  readonly label: string;
  readonly icon: SymbolViewProps["name"];
  readonly onPress: () => void;
}

export function ActionMenu({
  progress,
  align,
  position,
  actions,
}: {
  progress: SharedValue<number>;
  align: TargetAlign;
  position: { left: number; top: number };
  actions: readonly MenuAction[];
}) {
  const style = usePopStyle(progress, "bottom", align);
  return (
    <Animated.View
      className="absolute"
      style={[{ ...position, width: MENU_WIDTH }, style]}
    >
      <GlassSurface
        className="overflow-hidden rounded-[24px] py-1.5"
        androidClassName="bg-background-elevated"
      >
        {actions.map((action) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            onPress={action.onPress}
            className="active:bg-fill mx-1.5 flex-row items-center justify-between rounded-[18px] px-3.5"
            style={{ height: ROW_HEIGHT }}
          >
            <Text className="text-body text-foreground">{action.label}</Text>
            <SymbolIcon
              name={action.icon}
              size={17}
              tintColorClassName="accent-foreground"
            />
          </Pressable>
        ))}
      </GlassSurface>
    </Animated.View>
  );
}

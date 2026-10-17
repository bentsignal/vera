import type { SymbolViewProps } from "expo-symbols";
import type { SharedValue } from "react-native-reanimated";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
} from "react-native-reanimated";

import type { MenuTarget, TargetAlign } from "./glass-message-menu";
import { Emoji } from "~/components/emoji";
import { GlassSurface } from "~/components/glass-surface";
import { SymbolIcon } from "~/components/symbol-icon";
import { QUICK_REACTIONS } from "~/features/messaging/reactions";
import { cn } from "~/lib/cn";
import { targetReactions } from "./menu-actions";
import { TITLE_LINE_HEIGHT, TITLE_LINES } from "./menu-title";

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

/**
 * Glass can't fade with its parent (see `GlassSurface`), so on iOS only
 * what's inside the glass fades, and the glass materializes on its own.
 */
const FADE_CONTENT = Platform.OS === "ios";

/**
 * Pops out of the message's corner, then settles: `frame` grows the whole
 * surface, and `content` goes on what's inside it.
 */
function usePopStyle(
  progress: SharedValue<number>,
  from: "bottom" | "top",
  align: TargetAlign,
) {
  const frame = useAnimatedStyle(() => ({
    opacity: FADE_CONTENT
      ? 1
      : interpolate(progress.value, [0, 0.45], [0, 1], "clamp"),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.35, 1]) }],
    transformOrigin: `${align === "end" ? "right" : "left"} ${from === "top" ? "bottom" : "top"}`,
  }));
  const content = useAnimatedStyle(() => ({
    opacity: FADE_CONTENT
      ? interpolate(progress.value, [0, 0.45], [0, 1], "clamp")
      : 1,
  }));
  return { content, frame };
}

/** Your reaction's highlight, inset so two side by side never touch. */
const HIGHLIGHT = EMOJI - 6;

/**
 * One quick reaction. Yours sit on a tinted circle, as in Messages; who
 * reacted with what is in the panel under the message (double tap) and
 * the sheet.
 */
function EmojiButton({
  emoji,
  mine,
  onPress,
}: {
  emoji: string;
  mine: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`React ${emoji}`}
      accessibilityState={{ selected: mine }}
      onPress={onPress}
      className="items-center justify-center"
      style={({ pressed }) => ({
        height: EMOJI,
        transform: [{ scale: pressed ? 1.2 : 1 }],
        width: EMOJI,
      })}
    >
      {mine && (
        <View
          className="bg-accent/25 absolute rounded-full"
          style={{ height: HIGHLIGHT, width: HIGHLIGHT }}
        />
      )}
      <Emoji emoji={emoji} size={27} />
    </Pressable>
  );
}

export function ReactionBar({
  target,
  progress,
  closing,
  position,
  onPick,
}: {
  target: MenuTarget;
  progress: SharedValue<number>;
  /** The menu is playing back into place. */
  closing: boolean;
  position: { left: number; top: number };
  onPick: (emoji: string) => void;
}) {
  const { content, frame } = usePopStyle(progress, "top", target.align);
  return (
    <Animated.View
      className="absolute"
      style={[{ ...position, height: BAR_HEIGHT, width: BAR_WIDTH }, frame]}
    >
      <GlassSurface
        isInteractive
        materialize
        shown={!closing}
        className="flex-1 rounded-full"
        androidClassName="bg-background-elevated"
      >
        <Animated.View
          className="flex-1 flex-row items-center"
          style={[{ paddingHorizontal: BAR_PADDING }, content]}
        >
          {QUICK_REACTIONS.map((emoji) => {
            const reaction = targetReactions(target).find(
              (item) => item.emoji === emoji,
            );
            return (
              <EmojiButton
                key={emoji}
                emoji={emoji}
                mine={reaction?.mine ?? false}
                onPress={() => onPick(emoji)}
              />
            );
          })}
        </Animated.View>
      </GlassSurface>
    </Animated.View>
  );
}

/** One row in the action menu under a lifted message. */
export interface MenuAction {
  readonly label: string;
  readonly icon: SymbolViewProps["name"];
  readonly onPress: () => void;
  /** It deletes something: in red. */
  readonly destructive?: boolean;
}

export function ActionMenu({
  progress,
  closing,
  align,
  position,
  title,
  actions,
}: {
  progress: SharedValue<number>;
  /** The menu is playing back into place. */
  closing: boolean;
  align: TargetAlign;
  position: { left: number; top: number };
  /** Shown above the actions in full, such as the link they're about. */
  title?: string;
  actions: readonly MenuAction[];
}) {
  const { content, frame } = usePopStyle(progress, "bottom", align);
  return (
    <Animated.View
      className="absolute"
      style={[{ ...position, width: MENU_WIDTH }, frame]}
    >
      <GlassSurface
        materialize
        shown={!closing}
        className="overflow-hidden rounded-[24px] py-1.5"
        androidClassName="bg-background-elevated"
      >
        <Animated.View style={content}>
          {title !== undefined && (
            <View className="border-separator border-b-hairline mx-1.5 mb-1 px-3.5 pt-1.5 pb-2.5">
              <Text
                numberOfLines={TITLE_LINES}
                className="text-footnote text-muted"
                style={{ lineHeight: TITLE_LINE_HEIGHT }}
              >
                {title}
              </Text>
            </View>
          )}
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              onPress={action.onPress}
              className="active:bg-fill mx-1.5 flex-row items-center justify-between rounded-[18px] px-3.5"
              style={{ height: ROW_HEIGHT }}
            >
              <Text
                className={cn(
                  "text-body",
                  action.destructive === true
                    ? "text-destructive"
                    : "text-foreground",
                )}
              >
                {action.label}
              </Text>
              <SymbolIcon
                name={action.icon}
                size={17}
                tintColorClassName={
                  action.destructive === true
                    ? "accent-destructive"
                    : "accent-foreground"
                }
              />
            </Pressable>
          ))}
        </Animated.View>
      </GlassSurface>
    </Animated.View>
  );
}

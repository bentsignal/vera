import type { ReactNode } from "react";
import type { View as NativeView } from "react-native";
import { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { LayoutAnimationConfig } from "react-native-reanimated";

import type { PreviewShape } from "./native-message-menu";
import type { Message } from "./types";
import type { ReactionSummary } from "~/features/messaging/reactions";
import type { ReactionsExperiment } from "~/features/preferences/store";
import { usePreference } from "~/features/preferences/store";
import { cn } from "~/lib/cn";
import { selectionTick } from "~/lib/native-extras";
import { LongPressMessage, useMessageActions } from "./message-actions";
import { ChipRow, POP_IN, POP_OUT } from "./reaction-chips";

/** At most this many emoji show in a badge or pill; the count covers all. */
const SHOWN = 3;
/** Room above a message for its corner badge, and below for its pill. */
const BADGE_ROOM = 14;
const PILL_ROOM = 12;

/** Most-used first, so the badge shows what people reacted with most. */
function ranked(reactions: readonly ReactionSummary[]) {
  // Hermes has no toSorted yet.
  return [...reactions].sort((a, b) => b.count - a.count);
}

function summary(reactions: readonly ReactionSummary[]) {
  return reactions
    .map((reaction) => `${reaction.emoji} ${reaction.count}`)
    .join(", ");
}

/**
 * Where a badge or pill sits: over the bubble's inner corner on the side
 * the message is on, or under plain (stacked) text, which has no edge.
 */
type Placement = "below" | "end" | "start";

const BADGE_PLACEMENT = {
  below: "self-start -mt-0.5",
  end: "absolute -top-[19px] -left-3",
  start: "absolute -top-[19px] -right-3",
} satisfies Record<Placement, string>;

const PILL_PLACEMENT = {
  below: "self-start mt-1",
  end: "absolute -bottom-[16px] left-2.5",
  start: "absolute -bottom-[16px] right-2.5",
} satisfies Record<Placement, string>;

/** One round tapback: the top emoji, and a count when there are more. */
function Tapback({
  emojis,
  count,
  mine,
}: {
  emojis: readonly string[];
  count: number;
  mine: boolean;
}) {
  const shown = emojis.slice(0, SHOWN);
  return (
    <View
      className={cn(
        "border-background h-[32px] min-w-[32px] flex-row items-center justify-center gap-px rounded-full border-[2.5px] px-[4px]",
        mine ? "bg-bubble-outgoing" : "bg-bubble-incoming",
      )}
    >
      {shown.map((emoji) => (
        <Text key={emoji} style={{ fontSize: 15 }}>
          {emoji}
        </Text>
      ))}
      {count > shown.length && (
        <Text
          className={cn(
            "text-caption pr-0.5 pl-px font-semibold",
            mine ? "text-on-accent" : "text-muted",
          )}
        >
          {count}
        </Text>
      )}
    </View>
  );
}

/**
 * iMessage's tapbacks: round badges tucked over the message's inner top
 * corner, ringed in the page color so they read as cut out of the bubble.
 * Yours sits in front in your color; everyone else's fans out behind it.
 */
function CornerBadge({
  reactions,
  placement,
  onPress,
}: {
  reactions: readonly ReactionSummary[];
  placement: Placement;
  onPress: () => void;
}) {
  // Yours sits on the corner and the others fan in over the bubble.
  const fanLeft = placement === "start";
  const others = ranked(reactions)
    .map((reaction) => ({
      count: reaction.count - (reaction.mine ? 1 : 0),
      emoji: reaction.emoji,
    }))
    .filter((reaction) => reaction.count > 0);
  const mine = reactions.filter((reaction) => reaction.mine);
  const othersCount = others.reduce((sum, item) => sum + item.count, 0);
  return (
    <Animated.View
      entering={POP_IN}
      exiting={POP_OUT}
      className={BADGE_PLACEMENT[placement]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Reactions: ${summary(reactions)}`}
        onPress={onPress}
        className={cn(
          "active:opacity-80",
          fanLeft ? "flex-row-reverse" : "flex-row",
        )}
      >
        {mine.length > 0 && (
          <View className="z-10">
            <Tapback
              emojis={mine.map((reaction) => reaction.emoji)}
              count={mine.length}
              mine
            />
          </View>
        )}
        {others.length > 0 && (
          <View
            className={cn(mine.length > 0 && (fanLeft ? "-mr-3" : "-ml-3"))}
          >
            <Tapback
              emojis={others.map((reaction) => reaction.emoji)}
              count={othersCount}
              mine={false}
            />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

/**
 * WhatsApp's pill: one capsule over the message's bottom edge listing the
 * top emoji and how many reacted.
 */
function EdgePill({
  reactions,
  placement,
  onPress,
}: {
  reactions: readonly ReactionSummary[];
  placement: Placement;
  onPress: () => void;
}) {
  const mine = reactions.some((reaction) => reaction.mine);
  const total = reactions.reduce((sum, reaction) => sum + reaction.count, 0);
  return (
    <Animated.View
      entering={POP_IN}
      exiting={POP_OUT}
      className={PILL_PLACEMENT[placement]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Reactions: ${summary(reactions)}`}
        onPress={onPress}
        className="border-background bg-background-elevated h-[28px] flex-row items-center gap-[3px] rounded-full border-2 px-2 shadow-sm active:opacity-80 dark:bg-[#2c2c2e]"
      >
        {ranked(reactions)
          .slice(0, SHOWN)
          .map((reaction) => (
            <Text key={reaction.emoji} style={{ fontSize: 14 }}>
              {reaction.emoji}
            </Text>
          ))}
        {total > 1 && (
          <Text
            className={cn(
              "text-footnote pl-px font-semibold",
              mine ? "text-accent" : "text-muted",
            )}
          >
            {total}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

function roomFor(
  style: ReactionsExperiment,
  hasReactions: boolean,
  placement: Placement,
) {
  if (!hasReactions || placement === "below") return {};
  if (style === "badge") return { paddingTop: BADGE_ROOM };
  if (style === "pill") return { paddingBottom: PILL_ROOM };
  return {};
}

/**
 * A message that opens its actions on a long press, with its reactions
 * drawn as the Experiments setting picks: a corner badge, an edge pill, or a
 * chip row. Badges and pills open the reaction picker; chips toggle directly.
 */
export function InteractiveMessage({
  message,
  align,
  shape,
  children,
}: {
  message: Message;
  /** Which side the message sits on. */
  align: "end" | "start";
  shape: PreviewShape;
  children: ReactNode;
}) {
  const style = usePreference("reactionsExperiment");
  const { open, toggleReaction } = useMessageActions();
  const ref = useRef<NativeView>(null);
  const { reactions } = message;
  const has = reactions.length > 0;
  const placement = shape === "card" ? "below" : align;

  function openPicker() {
    selectionTick();
    ref.current?.measureInWindow((x, y, width, height) =>
      open({
        align,
        message,
        preview: children,
        rect: { height, width, x, y },
        shape,
      }),
    );
  }

  return (
    // Reactions already there when the row mounts don't pop in on scroll.
    <LayoutAnimationConfig skipEntering>
      <View
        className={align === "end" ? "self-end" : "self-start"}
        style={roomFor(style, has, placement)}
      >
        <View ref={ref}>
          <LongPressMessage message={message} align={align} shape={shape}>
            {children}
          </LongPressMessage>
          {has && style === "badge" && (
            <CornerBadge
              reactions={reactions}
              placement={placement}
              onPress={openPicker}
            />
          )}
          {has && style === "pill" && (
            <EdgePill
              reactions={reactions}
              placement={placement}
              onPress={openPicker}
            />
          )}
        </View>
        {has && style === "chips" && (
          <ChipRow
            reactions={reactions}
            align={align}
            onAdd={openPicker}
            onToggle={(emoji) => {
              selectionTick();
              toggleReaction(message.id, emoji);
            }}
          />
        )}
      </View>
    </LayoutAnimationConfig>
  );
}

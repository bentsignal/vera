import type { ReactNode } from "react";
import type { View as NativeView } from "react-native";
import { createContext, use, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Message } from "./types";
import { QUICK_REACTIONS } from "~/features/messaging/reactions";
import { cn } from "~/lib/cn";
import { canCopy, copyText, impact, selectionTick } from "~/lib/native-extras";

interface Rect {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

interface Target {
  readonly message: Message;
  readonly rect: Rect;
}

interface MessageActions {
  readonly open: (target: Target) => void;
  readonly toggleReaction: (messageId: string, emoji: string) => void;
}

const MessageActionsContext = createContext<MessageActions | null>(null);

function useMessageActions() {
  const actions = use(MessageActionsContext);
  if (actions === null) {
    throw new Error("Messages must render inside MessageActionsProvider");
  }
  return actions;
}

const EMOJI_SIZE = 44;
const PICKER_PADDING = 6;
const PICKER_HEIGHT = EMOJI_SIZE + PICKER_PADDING * 2;
const PICKER_WIDTH = QUICK_REACTIONS.length * EMOJI_SIZE + PICKER_PADDING * 2;
const GAP = 8;

/** Where the picker sits: above the message, or below it near the top. */
function pickerPosition(
  rect: Rect,
  screen: { height: number; width: number },
  topInset: number,
) {
  const left = Math.min(
    Math.max(12, rect.x + rect.width / 2 - PICKER_WIDTH / 2),
    screen.width - PICKER_WIDTH - 12,
  );
  const above = rect.y - PICKER_HEIGHT - GAP;
  const top =
    above > topInset + 56
      ? above
      : Math.min(
          rect.y + rect.height + GAP,
          screen.height - PICKER_HEIGHT - 40,
        );
  return { left, top };
}

function ReactionPicker({
  target,
  onClose,
  onReact,
}: {
  target: Target;
  onClose: () => void;
  onReact: (emoji: string) => void;
}) {
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { left, top } = pickerPosition(target.rect, screen, insets.top);
  const mine = new Set(
    target.message.reactions
      .filter((reaction) => reaction.mine)
      .map((reaction) => reaction.emoji),
  );
  const { body } = target.message;
  return (
    <Pressable
      accessibilityLabel="Close reactions"
      className="flex-1 bg-black/25"
      onPress={onClose}
    >
      <Animated.View
        entering={ZoomIn.duration(160)}
        className="bg-background-elevated absolute flex-row rounded-full shadow-lg"
        style={{ left, padding: PICKER_PADDING, top, width: PICKER_WIDTH }}
      >
        {QUICK_REACTIONS.map((emoji) => (
          <Pressable
            key={emoji}
            accessibilityRole="button"
            accessibilityLabel={`React ${emoji}`}
            onPress={() => onReact(emoji)}
            className={cn(
              "items-center justify-center rounded-full active:opacity-60",
              mine.has(emoji) && "bg-accent/20",
            )}
            style={{ height: EMOJI_SIZE, width: EMOJI_SIZE }}
          >
            <Text style={{ fontSize: 26 }}>{emoji}</Text>
          </Pressable>
        ))}
      </Animated.View>
      {canCopy && body !== undefined && (
        <Animated.View
          entering={FadeIn.duration(160)}
          className="absolute"
          style={{
            left: Math.min(target.rect.x, screen.width - 140),
            top: Math.min(
              target.rect.y + target.rect.height + GAP,
              screen.height - 120,
            ),
          }}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              copyText(body);
              onClose();
            }}
            className="bg-background-elevated rounded-xl px-4 py-2.5 shadow-lg active:opacity-70"
          >
            <Text className="text-body text-foreground">Copy</Text>
          </Pressable>
        </Animated.View>
      )}
    </Pressable>
  );
}

/**
 * Long-press actions for the messages below: a reaction picker (and Copy)
 * floating over the conversation, and reaction toggles for the chips.
 */
export function MessageActionsProvider({
  onToggleReaction,
  children,
}: {
  onToggleReaction: (messageId: string, emoji: string) => void;
  children: ReactNode;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  return (
    <MessageActionsContext
      value={{ open: setTarget, toggleReaction: onToggleReaction }}
    >
      {children}
      <Modal
        transparent
        visible={target !== null}
        animationType="fade"
        onRequestClose={() => setTarget(null)}
      >
        {target !== null && (
          <ReactionPicker
            target={target}
            onClose={() => setTarget(null)}
            onReact={(emoji) => {
              selectionTick();
              onToggleReaction(target.message.id, emoji);
              setTarget(null);
            }}
          />
        )}
      </Modal>
    </MessageActionsContext>
  );
}

/** Long press (with a haptic tap) opens the reaction picker for a message. */
export function LongPressMessage({
  message,
  children,
}: {
  message: Message;
  children: ReactNode;
}) {
  const { open } = useMessageActions();
  const ref = useRef<NativeView>(null);
  return (
    <Pressable
      ref={ref}
      delayLongPress={280}
      disabled={message.status !== undefined}
      onLongPress={() => {
        impact();
        ref.current?.measureInWindow((x, y, width, height) =>
          open({ message, rect: { height, width, x, y } }),
        );
      }}
    >
      {children}
    </Pressable>
  );
}

/** Reaction counts under a message (Slack-style); tap one to toggle yours. */
export function ReactionChips({
  message,
  align,
}: {
  message: Message;
  align: "end" | "start";
}) {
  const { toggleReaction } = useMessageActions();
  if (message.reactions.length === 0) return null;
  return (
    <View
      className={cn(
        "flex-row flex-wrap gap-1 pt-1",
        align === "end" ? "justify-end" : "justify-start",
      )}
    >
      {message.reactions.map((reaction) => (
        <Pressable
          key={reaction.emoji}
          accessibilityRole="button"
          accessibilityLabel={`${reaction.emoji} ${reaction.count}`}
          accessibilityState={{ selected: reaction.mine }}
          onPress={() => {
            selectionTick();
            toggleReaction(message.id, reaction.emoji);
          }}
          className={cn(
            "flex-row items-center gap-1 rounded-full border px-2 py-0.5 active:opacity-70",
            reaction.mine
              ? "border-accent bg-accent/15"
              : "bg-fill border-transparent",
          )}
        >
          <Text style={{ fontSize: 14 }}>{reaction.emoji}</Text>
          <Text
            className={cn(
              "text-footnote font-semibold",
              reaction.mine ? "text-accent" : "text-muted",
            )}
          >
            {reaction.count}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

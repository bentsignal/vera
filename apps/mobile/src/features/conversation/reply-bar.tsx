import { Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { GesturePressable } from "~/components/gesture-pressable";
import { SymbolIcon } from "~/components/symbol-icon";

/** Who and what the next message replies to, shown over the field. */
export interface ReplyingTo {
  /** Who wrote the message being answered. */
  readonly name: string;
  /** Its text, or what it sent instead. */
  readonly text: string;
}

/**
 * A line about what the field is doing, at its top: what it's about, the
 * message it's about, and a button to stop.
 */
function FieldBar({
  title,
  text,
  cancelLabel,
  onCancel,
}: {
  title: string;
  text: string;
  cancelLabel: string;
  onCancel: () => void;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(120)}
      className="flex-row items-center gap-2 pt-2 pr-2 pl-4"
    >
      <View className="border-accent flex-1 border-l-2 pl-2">
        <Text numberOfLines={1} className="text-caption text-accent">
          {title}
        </Text>
        <Text numberOfLines={1} className="text-footnote text-muted">
          {text}
        </Text>
      </View>
      <GesturePressable
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
        hitSlop={8}
        onPress={onCancel}
        pressedClassName="opacity-60"
      >
        <SymbolIcon
          name={{ android: "close", ios: "xmark.circle.fill" }}
          size={18}
          tintColorClassName="accent-subtle"
        />
      </GesturePressable>
    </Animated.View>
  );
}

/**
 * "Replying to Maya" and the message, at the top of the field, with a
 * button to send a plain message instead.
 */
export function ReplyBar({
  replyingTo,
  onCancel,
}: {
  replyingTo: ReplyingTo;
  onCancel: () => void;
}) {
  return (
    <FieldBar
      title={`Replying to ${replyingTo.name}`}
      text={replyingTo.text}
      cancelLabel="Cancel Reply"
      onCancel={onCancel}
    />
  );
}

/** A message of yours the field is editing. */
export interface Editing {
  /** Its text as sent, or what it sent instead. */
  readonly text: string;
  /** It has attachments, so its text can be edited away. */
  readonly canEmpty: boolean;
}

/**
 * "Editing Message" and the message as it was, at the top of the field,
 * with a button to leave it as it was.
 */
export function EditBar({
  editing,
  onCancel,
}: {
  editing: Editing;
  onCancel: () => void;
}) {
  return (
    <FieldBar
      title="Editing Message"
      text={editing.text}
      cancelLabel="Cancel Editing"
      onCancel={onCancel}
    />
  );
}

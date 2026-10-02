import type { ReactNode } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import type { Message } from "./types";
import { SymbolIcon } from "~/components/symbol-icon";
import { formatTime } from "~/lib/format";

/**
 * Fades a message in from translucent while it is sending, so a confirmed
 * send settles in place instead of swapping a "Sending…" label.
 */
export function SendingFade({
  status,
  children,
}: {
  status: Message["status"];
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: withTiming(status === "sending" ? 0.55 : 1, { duration: 220 }),
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** The time under a run of messages, or why a message did not send. */
export function MessageMeta({
  message,
  showTime,
  align,
}: {
  message: Message;
  showTime: boolean;
  align: "end" | "start";
}) {
  if (message.status === "failed") {
    return (
      <View className="flex-row items-center gap-1 px-1">
        <SymbolIcon
          name={{ android: "error", ios: "exclamationmark.circle.fill" }}
          size={12}
          tintColorClassName="accent-destructive"
        />
        <Text className="text-caption text-destructive">Not sent</Text>
      </View>
    );
  }
  if (!showTime || message.status === "sending") return null;
  return (
    <Text
      className={`text-caption text-muted px-1 ${align === "end" ? "text-right" : ""}`}
    >
      {formatTime(message.sentAt)}
    </Text>
  );
}

import type { ReactNode } from "react";
import { View } from "react-native";
import { LayoutAnimationConfig } from "react-native-reanimated";

import type { PreviewShape } from "./glass-message-menu";
import type { Message } from "./types";
import { selectionTick } from "~/lib/native-extras";
import { LongPressMessage, useMessageActions } from "./message-actions";
import { ChipRow } from "./reaction-chips";

/**
 * A message that opens the glass reaction overlay on a long press, with its
 * reactions as glass chips underneath. Tapping a chip adds or takes back
 * that reaction.
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
  const { toggleReaction } = useMessageActions();
  return (
    // Reactions already there when the row mounts don't pop in on scroll.
    <LayoutAnimationConfig skipEntering>
      <View className={align === "end" ? "self-end" : "self-start"}>
        <LongPressMessage message={message} align={align} shape={shape}>
          {children}
        </LongPressMessage>
        {message.reactions.length > 0 && (
          <ChipRow
            reactions={message.reactions}
            align={align}
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

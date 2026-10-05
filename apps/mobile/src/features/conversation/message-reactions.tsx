import type { ReactNode } from "react";
import { useState } from "react";
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
  // New messages change which reactions a page asks for, so they reload.
  // Keep the last ones on screen meanwhile instead of dropping them.
  const [lastLoaded, setLastLoaded] = useState(message.reactions);
  if (message.reactions !== undefined && message.reactions !== lastLoaded) {
    setLastLoaded(message.reactions);
  }
  const reactions = message.reactions ?? lastLoaded;
  return (
    // Reactions already there when the row mounts don't pop in on scroll.
    <LayoutAnimationConfig skipEntering>
      <View className={align === "end" ? "self-end" : "self-start"}>
        <LongPressMessage message={message} align={align} shape={shape}>
          {children}
        </LongPressMessage>
        {reactions !== undefined && (
          // Nor do the ones that load after the row: only a reaction added
          // while the thread is open pops in.
          <LayoutAnimationConfig skipEntering>
            {reactions.length > 0 && (
              <ChipRow
                reactions={reactions}
                align={align}
                onToggle={(emoji) => {
                  selectionTick();
                  toggleReaction(message.id, emoji);
                }}
              />
            )}
          </LayoutAnimationConfig>
        )}
      </View>
    </LayoutAnimationConfig>
  );
}

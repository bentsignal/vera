import type { ReactNode } from "react";
import type { NativeSyntheticEvent, ViewProps } from "react-native";
import { View } from "react-native";
import { requireNativeView, requireOptionalNativeModule } from "expo";

import type { Message } from "./types";
import { QUICK_REACTIONS } from "~/features/messaging/reactions";
import { canCopy, copyText } from "~/lib/native-extras";
import { BUBBLE_RADIUS } from "./bubble-shape";

interface MenuAction {
  readonly id: string;
  readonly title: string;
  readonly systemImage?: string;
}

interface NativeMessageMenuProps extends ViewProps {
  readonly reactions: readonly string[];
  readonly selectedReactions: readonly string[];
  readonly actions: readonly MenuAction[];
  readonly previewCornerRadius: number;
  readonly previewInset: number;
  readonly previewBackground: boolean;
  readonly enabled: boolean;
  readonly onReact: (event: NativeSyntheticEvent<{ emoji: string }>) => void;
  readonly onAction: (event: NativeSyntheticEvent<{ id: string }>) => void;
}

// `modules/message-menu`, a local native module. Builds made before it was
// added fall back to the glass overlay.
const nativeMenuModule = requireOptionalNativeModule<object>("MessageMenu");
const NativeMenuView =
  nativeMenuModule === null
    ? null
    : requireNativeView<NativeMessageMenuProps>("MessageMenu");

/** Whether this build has the system context menu for messages. */
export const hasNativeMessageMenu = NativeMenuView !== null;

/** How the lifted preview is cut out: the bubble, or a card around text. */
export type PreviewShape = "bubble" | "card";

/**
 * The system context menu (UIContextMenuInteraction): the message lifts out
 * of the dimmed conversation with a palette of reactions above Copy.
 */
export function NativeMessageMenu({
  message,
  shape,
  onReact,
  children,
}: {
  message: Message;
  shape: PreviewShape;
  onReact: (emoji: string) => void;
  children: ReactNode;
}) {
  const { body } = message;
  if (NativeMenuView === null) return children;
  const actions =
    canCopy && body !== undefined && body !== ""
      ? [{ id: "copy", systemImage: "doc.on.doc", title: "Copy" }]
      : [];
  return (
    <NativeMenuView
      reactions={QUICK_REACTIONS}
      selectedReactions={message.reactions
        .filter((reaction) => reaction.mine)
        .map((reaction) => reaction.emoji)}
      actions={actions}
      previewCornerRadius={shape === "bubble" ? BUBBLE_RADIUS : 14}
      previewInset={shape === "bubble" ? 0 : 8}
      previewBackground={shape === "card"}
      enabled={message.status === undefined}
      onReact={(event) => onReact(event.nativeEvent.emoji)}
      onAction={(event) => {
        if (event.nativeEvent.id === "copy" && body !== undefined) {
          copyText(body);
        }
      }}
    >
      {/* One real view, so the menu lifts exactly the message. */}
      <View collapsable={false}>{children}</View>
    </NativeMenuView>
  );
}

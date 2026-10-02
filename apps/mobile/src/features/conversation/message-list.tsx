import type { LegendListRef } from "@legendapp/list/react-native";
import type { ReactNode } from "react";
import { useRef } from "react";
import { Pressable } from "react-native";
import Animated, {
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { KeyboardAwareLegendList } from "@legendapp/list/keyboard";

import type { MessageRow } from "./build-rows";
import type { Message } from "./types";
import type { MessageLayout } from "~/features/preferences/store";
import { SymbolIcon } from "~/components/symbol-icon";
import { buildMessageRows } from "./build-rows";
import { DaySeparator, TimeHeader } from "./day-separator";
import { MessageActionsProvider } from "./message-actions";
import { MessageBubble } from "./message-bubble";
import { MessageStacked } from "./message-stacked";
import { RevealTimes } from "./reveal";

type ProfileOf = (address: string) => {
  avatarUrl: string | null;
  displayName: string;
};

/** Fades a tint behind the message a conversation opened on. */
function Highlight({ children }: { children: ReactNode }) {
  const tint = useSharedValue(1);
  useAnimatedReaction(
    () => true,
    (_, previous) => {
      if (previous === null)
        tint.value = withDelay(800, withTiming(0, { duration: 1600 }));
    },
  );
  const style = useAnimatedStyle(() => ({
    backgroundColor: `rgba(124, 124, 255, ${0.18 * tint.value})`,
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

interface RowProps {
  row: MessageRow;
  self: string;
  layout: MessageLayout;
  profileOf: ProfileOf;
  showAuthors: boolean;
}

function Row({ highlighted, ...props }: RowProps & { highlighted: boolean }) {
  return highlighted ? (
    <Highlight>
      <RowContent {...props} />
    </Highlight>
  ) : (
    <RowContent {...props} />
  );
}

function RowContent({ row, self, layout, profileOf, showAuthors }: RowProps) {
  if (row.type === "day") return <DaySeparator date={row.date} />;
  if (row.type === "time") return <TimeHeader date={row.date} />;
  const { message } = row;
  if (layout === "stacked") {
    return (
      <MessageStacked
        message={message}
        author={profileOf(message.authorId)}
        startsGroup={row.startsGroup}
      />
    );
  }
  return (
    <MessageBubble
      message={message}
      isOwn={message.authorId === self}
      author={showAuthors ? profileOf(message.authorId) : undefined}
      startsGroup={row.startsGroup}
      endsGroup={row.endsGroup}
      delivered={row.delivered}
    />
  );
}

function JumpToLatest({
  visible,
  bottom,
  onPress,
}: {
  visible: { value: boolean };
  /** Distance from the bottom edge, above the floating composer. */
  bottom: number;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: withTiming(visible.value ? 1 : 0, { duration: 160 }),
    transform: [
      { scale: withTiming(visible.value ? 1 : 0.8, { duration: 160 }) },
    ],
  }));
  const props = useAnimatedProps(() => ({
    pointerEvents: visible.value ? ("auto" as const) : ("none" as const),
  }));
  return (
    <Animated.View
      animatedProps={props}
      className="absolute right-4"
      style={[{ bottom }, style]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Jump to latest"
        onPress={onPress}
        className="bg-background-elevated border-hairline border-separator size-10 items-center justify-center rounded-full shadow-sm"
      >
        <SymbolIcon
          name={{ android: "keyboard_arrow_down", ios: "chevron.down" }}
          size={18}
          weight="semibold"
          tintColorClassName="accent-accent"
        />
      </Pressable>
    </Animated.View>
  );
}

/**
 * The conversation, oldest first and aligned to the bottom. Loads older
 * pages near the top and newer ones near the bottom without moving what is on
 * screen, and opens on `anchorId` when given.
 */
export function MessageList({
  messages,
  self,
  layout,
  profileOf,
  showAuthors,
  anchorId,
  hasNewer,
  onStartReached,
  onEndReached,
  onJumpToLatest,
  bottomInset,
  composerHeight,
  onToggleReaction,
}: {
  messages: readonly Message[];
  /** The signed-in account's address. */
  self: string;
  layout: MessageLayout;
  profileOf: ProfileOf;
  /** Name incoming bubbles; for groups and channels. */
  showAuthors: boolean;
  anchorId?: string;
  /** Newer messages exist beyond the loaded window. */
  hasNewer: boolean;
  onStartReached: () => void;
  onEndReached: () => void;
  onJumpToLatest: () => void;
  bottomInset: number;
  /** Height of the composer floating over the bottom of the list. */
  composerHeight: number;
  onToggleReaction: (messageId: string, emoji: string) => void;
}) {
  const listRef = useRef<LegendListRef>(null);
  // Hidden until the first layout settles at its starting position, then
  // faded in, so nothing flashes or jumps into place.
  const loaded = useSharedValue(0);
  const fadeIn = useAnimatedStyle(() => ({ opacity: loaded.value }));
  const isNearEnd = useSharedValue(true);
  const showJump = useDerivedValue(() => hasNewer || !isNearEnd.value);
  const rows = buildMessageRows(messages, { layout, self });
  const anchorIndex =
    anchorId === undefined ? -1 : rows.findIndex((row) => row.key === anchorId);

  return (
    <MessageActionsProvider onToggleReaction={onToggleReaction}>
      <RevealTimes>
        <Animated.View style={[{ flex: 1 }, fadeIn]}>
          <KeyboardAwareLegendList
            ref={listRef}
            data={rows}
            keyExtractor={(row) => row.key}
            getItemType={(row) => row.type}
            renderItem={({ item }) => (
              <Row
                row={item}
                self={self}
                layout={layout}
                profileOf={profileOf}
                showAuthors={showAuthors}
                highlighted={item.key === anchorId}
              />
            )}
            estimatedItemSize={56}
            recycleItems
            alignItemsAtEnd
            maintainScrollAtEnd={!hasNewer}
            maintainVisibleContentPosition
            {...(anchorIndex === -1
              ? { initialScrollAtEnd: true }
              : {
                  initialScrollIndex: { index: anchorIndex, viewPosition: 0.5 },
                })}
            onStartReached={onStartReached}
            onStartReachedThreshold={1}
            onEndReached={onEndReached}
            onEndReachedThreshold={1}
            sharedValues={{ isNearEnd }}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            keyboardOffset={bottomInset}
            contentInsetAdjustmentBehavior="automatic"
            // Messages scroll under the floating composer.
            contentContainerStyle={{
              paddingBottom: composerHeight + 8,
              paddingTop: 8,
            }}
            onLoad={() => {
              loaded.set(withTiming(1, { duration: 220 }));
            }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </RevealTimes>
      <JumpToLatest
        visible={showJump}
        bottom={composerHeight + 12}
        onPress={() => {
          if (hasNewer) onJumpToLatest();
          else void listRef.current?.scrollToEnd({ animated: true });
        }}
      />
    </MessageActionsProvider>
  );
}

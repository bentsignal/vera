import type { LegendListRef } from "@legendapp/list/react-native";
import { useRef } from "react";
import { Pressable } from "react-native";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { KeyboardAwareLegendList } from "@legendapp/list/keyboard";

import type { MessageRow } from "./build-rows";
import type { Message } from "./types";
import { SymbolIcon } from "~/components/symbol-icon";
import { buildMessageRows } from "./build-rows";
import { DaySeparator } from "./day-separator";
import { MessageBubble } from "./message-bubble";

function Row({
  row,
  self,
  authorName,
}: {
  row: MessageRow;
  self: string;
  authorName?: (address: string) => string;
}) {
  if (row.type === "day") return <DaySeparator date={row.date} />;
  const isOwn = row.message.authorId === self;
  return (
    <MessageBubble
      message={row.message}
      isOwn={isOwn}
      authorName={isOwn ? undefined : authorName?.(row.message.authorId)}
      startsGroup={row.startsGroup}
      endsGroup={row.endsGroup}
    />
  );
}

function JumpToLatest({
  visible,
  onPress,
}: {
  visible: { value: boolean };
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
      className="absolute right-4 bottom-3"
      style={style}
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
  authorName,
  anchorId,
  hasNewer,
  onStartReached,
  onEndReached,
  onJumpToLatest,
  bottomInset,
}: {
  messages: readonly Message[];
  /** The signed-in account's address. */
  self: string;
  /** Labels incoming messages; pass it for groups and channels. */
  authorName?: (address: string) => string;
  anchorId?: string;
  /** Newer messages exist beyond the loaded window. */
  hasNewer: boolean;
  onStartReached: () => void;
  onEndReached: () => void;
  onJumpToLatest: () => void;
  bottomInset: number;
}) {
  const listRef = useRef<LegendListRef>(null);
  const isNearEnd = useSharedValue(true);
  const showJump = useDerivedValue(() => hasNewer || !isNearEnd.value);
  const rows = buildMessageRows(messages);
  const anchorIndex =
    anchorId === undefined ? -1 : rows.findIndex((row) => row.key === anchorId);

  return (
    <>
      <KeyboardAwareLegendList
        ref={listRef}
        data={rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.type}
        renderItem={({ item }) => (
          <Row row={item} self={self} authorName={authorName} />
        )}
        estimatedItemSize={56}
        recycleItems
        alignItemsAtEnd
        maintainScrollAtEnd={!hasNewer}
        maintainVisibleContentPosition
        {...(anchorIndex === -1
          ? { initialScrollAtEnd: true }
          : { initialScrollIndex: { index: anchorIndex, viewPosition: 0.5 } })}
        onStartReached={onStartReached}
        onStartReachedThreshold={1}
        onEndReached={onEndReached}
        onEndReachedThreshold={1}
        sharedValues={{ isNearEnd }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        keyboardOffset={bottomInset}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingVertical: 8 }}
        style={{ flex: 1 }}
      />
      <JumpToLatest
        visible={showJump}
        onPress={() => {
          if (hasNewer) onJumpToLatest();
          else void listRef.current?.scrollToEnd({ animated: true });
        }}
      />
    </>
  );
}

import type { RefObject } from "react";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import type { MessageListProps } from "../native-list/list-props";
import type { MessageListViewMethods } from "../native-list/native";
import { Avatar } from "~/components/avatar";
import { GlassSurface } from "~/components/glass-surface";
import { SymbolIcon } from "~/components/symbol-icon";
import { summaryOf } from "../native-list/map-rows";

// Development only: the `sticky` thread look's bar (thread-looks.ts).

/**
 * The original, pinned under the header once it scrolls away (`sticky`).
 * A tap scrolls back up to it.
 */
function StickyOriginal({
  top,
  author,
  text,
  onPress,
}: {
  top: number;
  author: { displayName: string; avatarUrl: string | null };
  text: string;
  onPress: () => void;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(180)}
      className="absolute right-4 left-4"
      style={{ top }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${author.displayName}: ${text}`}
        onPress={onPress}
      >
        {({ pressed }) => (
          <GlassSurface className="rounded-[22px] px-3 py-2">
            <View
              className="flex-row items-center gap-2.5"
              style={{ opacity: pressed ? 0.7 : 1 }}
            >
              <Avatar
                name={author.displayName}
                uri={author.avatarUrl}
                size="sm"
              />
              <View className="flex-1">
                <Text
                  className="text-footnote text-foreground font-semibold"
                  numberOfLines={1}
                >
                  {author.displayName}
                </Text>
                <Text className="text-footnote text-muted" numberOfLines={1}>
                  {text}
                </Text>
              </View>
              <SymbolIcon
                name={{ android: "keyboard_arrow_up", ios: "chevron.up" }}
                size={13}
                weight="semibold"
                tintColorClassName="accent-muted"
              />
            </View>
          </GlassSurface>
        )}
      </Pressable>
    </Animated.View>
  );
}

/**
 * The `sticky` look's bar, which shows while the original is off screen
 * (the list's `visible` rows), and what tells it.
 */
export function useStickyOriginal(
  {
    thread,
    threadLook,
    profileOf,
  }: Pick<MessageListProps, "thread" | "threadLook" | "profileOf">,
  view: RefObject<MessageListViewMethods | null>,
  top: number,
) {
  const [rootShown, setRootShown] = useState(true);
  if (thread === undefined || threadLook === undefined) {
    return { bar: null, onVisible: undefined };
  }
  const { root } = thread;
  // Followed in every look, so switching to this one shows it at once.
  function onVisible(rowIds: readonly string[]) {
    setRootShown(rowIds.includes(root.id));
  }
  if (threadLook.look !== "sticky" || rootShown) {
    return { bar: null, onVisible };
  }
  return {
    bar: (
      <StickyOriginal
        top={top}
        author={profileOf(root.authorId)}
        text={summaryOf(root)}
        onPress={() => void view.current?.scrollToRow(root.id, true)}
      />
    ),
    onVisible,
  };
}

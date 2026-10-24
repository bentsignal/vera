import { useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import type { ViewerItem } from "./media-group";
import type { Pager } from "./photo-viewer-state";
import { PlayBadge } from "./attachment-view";
import { pagesAround } from "./photo-pager";
import { PhotoViewer } from "./photo-viewer";
import { ViewerCloseButton } from "./viewer-close-button";

function sizeOf(item: ViewerItem) {
  const { height = 0, width = 0 } = item;
  return width > 0 && height > 0 ? { height, width } : undefined;
}

/**
 * The close button, drawn once over every page so it never moves as they
 * slide (it used to ride in the shown page, counter-moved, and jumped a
 * frame toward the swipe when the shown page changed). It fades with the
 * backdrop as the shown photo is swiped away, and closes through it.
 */
function CloseChrome({ pager }: { pager: Pager }) {
  const insets = useSafeAreaInsets();
  const fade = useAnimatedStyle(() => ({ opacity: pager.backdrop.get() }));
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, fade]}
    >
      <View className="absolute left-4" style={{ top: insets.top + 8 }}>
        <ViewerCloseButton
          onPress={() => pager.closeRequests.set(pager.closeRequests.get() + 1)}
        />
      </View>
    </Animated.View>
  );
}

/**
 * A video's play button over its poster. It fades with the backdrop as
 * the page is swiped away, rather than staying over the conversation
 * until the viewer closes.
 */
function PlayButton({ url, pager }: { url: string; pager: Pager }) {
  const router = useRouter();
  const fade = useAnimatedStyle(() => ({ opacity: pager.backdrop.get() }));
  return (
    <Animated.View
      pointerEvents="box-none"
      className="absolute inset-0 items-center justify-center"
      style={fade}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Play video"
        onPress={() =>
          router.push({ params: { kind: "video", url }, pathname: "/media" })
        }
      >
        <PlayBadge />
      </Pressable>
    </Animated.View>
  );
}

function Page({
  item,
  index,
  width,
  pager,
  current,
  onClose,
}: {
  item: ViewerItem;
  index: number;
  width: number;
  pager: Pager;
  current: boolean;
  onClose: () => void;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (index - pager.position.get()) * width }],
  }));
  const shown = item.kind === "video" ? item.poster : item.url;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <PhotoViewer
        url={shown ?? ""}
        size={sizeOf(item)}
        onClose={onClose}
        pager={pager}
        current={current}
      />
      {item.kind === "video" && <PlayButton url={item.url} pager={pager} />}
    </Animated.View>
  );
}

/**
 * A message's photos and videos, full screen, on the one tapped: swipe
 * sideways through the rest, pinch or double-tap to zoom, swipe down to
 * close. A video shows its poster with a play button, which opens it in
 * the video viewer. Like `PhotoViewer`, it animates its own closing, then
 * calls `onClose`.
 */
export function MediaGroupViewer({
  items,
  start,
  onClose,
}: {
  items: readonly ViewerItem[];
  start: number;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const first = Math.min(Math.max(0, start), items.length - 1);
  const [index, setIndex] = useState(first);
  const position = useSharedValue(first);
  const backdrop = useSharedValue(1);
  const closeRequests = useSharedValue(0);
  const pager = {
    backdrop,
    closeRequests,
    count: items.length,
    onTurn: setIndex,
    position,
  };
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Still while the pages slide over it, so nothing shows between or
          past them; the shown page fades it as it's swiped away. */}
      <Animated.View
        className="bg-black"
        style={[StyleSheet.absoluteFill, backdropStyle]}
      />
      {pagesAround(index, items.length).map((page) => {
        const item = items[page];
        return (
          item !== undefined && (
            <Page
              key={`${page}:${item.url}`}
              item={item}
              index={page}
              width={width}
              pager={pager}
              current={page === index}
              onClose={onClose}
            />
          )
        );
      })}
      <CloseChrome pager={pager} />
    </View>
  );
}

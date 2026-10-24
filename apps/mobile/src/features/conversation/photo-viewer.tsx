import type { ImageLoadEventData } from "expo-image";
import type { ReactNode } from "react";
import type { LayoutChangeEvent } from "react-native";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Image } from "expo-image";

import type { Size } from "./photo-transform";
import type { Pager } from "./photo-viewer-state";
import { markPhoto } from "~/features/dev/photo-timing";
import { touchGesture } from "./photo-gestures";
import { dismissTransform } from "./photo-transform";
import {
  doubleTapGesture,
  fadeOf,
  fadeOut,
  useViewer,
} from "./photo-viewer-state";

/**
 * The photo's frame and image events: they size the zoom, and mark when
 * the photo laid out, loaded and showed (`markPhoto`, dev and profile
 * bundles only).
 */
function usePhotoEvents(viewer: ReturnType<typeof useViewer>, url: string) {
  return {
    onLayout: (event: LayoutChangeEvent) => {
      markPhoto("pageLayout", { url });
      viewer.frame.set({
        height: event.nativeEvent.layout.height,
        width: event.nativeEvent.layout.width,
      });
    },
    image: {
      onDisplay: () => markPhoto("display", { url }),
      onLoad: (event: ImageLoadEventData) => {
        markPhoto("load", { url });
        viewer.photo.set({
          height: event.source.height,
          width: event.source.width,
        });
      },
      onLoadStart: () => markPhoto("loadStart", { url }),
    },
  };
}

/**
 * A full-screen photo you can pinch or double-tap to zoom, drag around once
 * zoomed, and swipe down to close. The black backdrop fades as the photo is
 * dragged away, showing the conversation behind it, like Photos.
 *
 * The viewer animates its own closing and calls `onClose` once it's done,
 * so its screen should close without an animation of its own.
 */
export function PhotoViewer({
  url,
  size,
  onClose,
  chrome,
  pager,
  current = true,
}: {
  url: string;
  /** The photo's pixel size, when the message knows it. */
  size?: Size;
  onClose: () => void;
  /**
   * Controls drawn over the photo; they fade out with the backdrop. `close`
   * fades the viewer out, then calls `onClose`.
   */
  chrome?: (close: () => void) => ReactNode;
  /**
   * One of a group, swiped through sideways (see `MediaGroupViewer`), over
   * the group's backdrop rather than its own.
   */
  pager?: Pager;
  /** In a group, the page shown, which fades the group's backdrop. */
  current?: boolean;
}) {
  const viewer = useViewer(size);
  const events = usePhotoEvents(viewer, url);
  const gesture = Gesture.Simultaneous(
    touchGesture(viewer, onClose, pager),
    doubleTapGesture(viewer),
  );

  function close() {
    fadeOut(viewer, onClose);
  }

  // Each style captures `viewer` itself: Reanimated updates a style for the
  // shared values its own function captures, not ones a helper reaches.
  const backdropStyle = useAnimatedStyle(() => ({ opacity: fadeOf(viewer) }));
  useAnimatedReaction(
    () => fadeOf(viewer),
    (fade) => {
      if (current) pager?.backdrop.set(fade);
    },
    [current],
  );
  // The group's close button (see `Pager`'s `closeRequests`).
  useAnimatedReaction(
    () => pager?.closeRequests.get() ?? 0,
    (now, before) => {
      if (current && before !== null && now !== before) scheduleOnRN(close);
    },
    [current],
  );
  const chromeStyle = useAnimatedStyle(() => ({ opacity: fadeOf(viewer) }));
  const photoStyle = useAnimatedStyle(() => {
    // The swipe to close draws on top of the zoom.
    const drag = dismissTransform(
      { x: viewer.dragX.get(), y: viewer.dragY.get() },
      viewer.anchor.get(),
      viewer.frame.get().height,
    );
    return {
      opacity: viewer.fade.get(),
      transform: [
        { translateX: drag.x + drag.scale * viewer.x.get() },
        { translateY: drag.y + drag.scale * viewer.y.get() },
        { scale: drag.scale * viewer.scale.get() },
      ],
    };
  });

  return (
    <>
      {pager === undefined && (
        <Animated.View
          className="bg-black"
          style={[StyleSheet.absoluteFill, backdropStyle]}
        />
      )}
      {/* Touches land on a frame that doesn't move, so their positions are
          in screen terms however the photo is zoomed. */}
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} onLayout={events.onLayout}>
          <Animated.View style={[StyleSheet.absoluteFill, photoStyle]}>
            <Image
              source={{ uri: url }}
              contentFit="contain"
              transition={150}
              {...events.image}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </View>
      </GestureDetector>
      <Animated.View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, chromeStyle]}
      >
        {chrome?.(close)}
      </Animated.View>
    </>
  );
}

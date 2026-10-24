import type { SharedValue } from "react-native-reanimated";
import { Platform, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { useVideoPlayer, VideoView } from "expo-video";

import {
  dismissProgress,
  dismissTransform,
  exitDuration,
  shouldDismiss,
} from "./photo-transform";
import { ViewerCloseButton } from "./viewer-close-button";

const SETTLE_SPRING = { dampingRatio: 1, duration: 350 } as const;
/** Keep the iOS player's controls clear of the viewer's Close button. */
const IOS_HEADER_HEIGHT = 48;

/**
 * Dragging the video down: it follows the finger and, let go far enough
 * down or flicked, carries on off the screen before `onClose`.
 */
function dragToClose(
  {
    closing,
    dragY,
    frameHeight,
  }: {
    closing: SharedValue<boolean>;
    dragY: SharedValue<number>;
    frameHeight: SharedValue<number>;
  },
  onClose: () => void,
) {
  return (
    Gesture.Pan()
      .maxPointers(1)
      // Down only; a sideways move is the player's (scrubbing, volume).
      .activeOffsetY(20)
      .failOffsetX([-20, 20])
      .onUpdate((event) => {
        if (!closing.get()) dragY.set(Math.max(0, event.translationY));
      })
      .onEnd((event) => {
        if (closing.get()) return;
        const y = dragY.get();
        if (!shouldDismiss(y, event.velocityY)) {
          dragY.set(
            withSpring(0, { ...SETTLE_SPRING, velocity: event.velocityY }),
          );
          return;
        }
        closing.set(true);
        const exit = frameHeight.get() * 1.2;
        const duration = exitDuration(
          exit - y,
          Math.max(event.velocityY, 1500),
        );
        dragY.set(
          withTiming(
            exit,
            { duration, easing: Easing.out(Easing.quad) },
            (finished) => {
              if (finished === true) scheduleOnRN(onClose);
            },
          ),
        );
      })
  );
}

/**
 * Full-screen video, with the platform's own player controls and
 * the close button over the top of the video. Dragging down closes it,
 * like a photo; the drag only starts on a vertical move, so scrubbing and
 * the player's buttons still work. The playing layer stays in this route
 * throughout dismissal, avoiding a native fullscreen handback before close.
 *
 * Like `PhotoViewer`, it animates its own closing and then calls
 * `onClose`.
 */
export function VideoViewer({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(url, (instance) => instance.play());
  const frameHeight = useSharedValue(0);
  const dragY = useSharedValue(0);
  const fade = useSharedValue(1);
  const closing = useSharedValue(false);

  const drag = dragToClose({ closing, dragY, frameHeight }, onClose);

  function close() {
    if (closing.get()) return;
    closing.set(true);
    fade.set(
      withTiming(0, { duration: 180 }, (finished) => {
        if (finished === true) scheduleOnRN(onClose);
      }),
    );
  }

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: fade.get() * (1 - dismissProgress(dragY.get(), frameHeight.get())),
  }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: fade.get() * (1 - dismissProgress(dragY.get(), frameHeight.get())),
  }));
  const videoStyle = useAnimatedStyle(() => {
    const shift = dismissTransform(
      { x: 0, y: dragY.get() },
      { x: 0, y: 0 },
      frameHeight.get(),
    );
    return {
      opacity: fade.get(),
      transform: [{ translateY: shift.y }, { scale: shift.scale }],
    };
  });

  return (
    <>
      <Animated.View
        className="bg-black"
        style={[StyleSheet.absoluteFill, backdropStyle]}
      />
      <GestureDetector gesture={drag}>
        <View
          // Clear of the status bar and the navigation buttons, so the
          // player's controls aren't hidden under them.
          style={[
            StyleSheet.absoluteFill,
            {
              paddingBottom: insets.bottom,
              paddingTop:
                insets.top + (Platform.OS === "ios" ? IOS_HEADER_HEIGHT : 0),
            },
          ]}
          onLayout={(event) => frameHeight.set(event.nativeEvent.layout.height)}
        >
          <Animated.View style={[{ flex: 1 }, videoStyle]}>
            <VideoView
              player={player}
              nativeControls
              allowsPictureInPicture
              // This route already fills the screen. A second iOS player
              // presentation returns to the full-size inline layer on exit.
              fullscreenOptions={
                Platform.OS === "ios" ? { enable: false } : undefined
              }
              contentFit="contain"
              // A TextureView moves and fades with the drag; Android's
              // default SurfaceView draws apart from the views around it.
              surfaceType={
                Platform.OS === "android" ? "textureView" : undefined
              }
              style={{ flex: 1 }}
            />
          </Animated.View>
        </View>
      </GestureDetector>
      <Animated.View
        pointerEvents="box-none"
        className="absolute left-4"
        style={[{ top: insets.top + 8 }, chromeStyle]}
      >
        <ViewerCloseButton onPress={close} />
      </Animated.View>
    </>
  );
}

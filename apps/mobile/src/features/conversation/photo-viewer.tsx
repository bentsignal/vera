import type { ReactNode } from "react";
import type { PanGestureHandlerEventPayload } from "react-native-gesture-handler";
import type { SharedValue } from "react-native-reanimated";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Image } from "expo-image";

const MAX_SCALE = 5;
/** How far a pinch can shrink the photo before it springs back. */
const MIN_PINCH_SCALE = 0.6;
const DOUBLE_TAP_SCALE = 2.5;
/** A drag this far down, or a flick this fast, closes the photo. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;
// Critically damped: zooming out never overshoots past the screen's edges.
const SETTLE = { damping: 35, mass: 1, stiffness: 300 };

interface Size {
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

/** Everything the viewer's gestures read and move. */
interface Zoom {
  /** The screen the photo fills. */
  frame: Size;
  /** The photo's pixel size, once known. */
  photo: SharedValue<Size | null>;
  scale: SharedValue<number>;
  /** How far the zoomed photo is moved from the center. */
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** Where the photo was when the current gesture started. */
  start: SharedValue<{ scale: number } & Point>;
  /** Where a pinch started, from the center of the screen. */
  focal: SharedValue<Point>;
  pinching: SharedValue<boolean>;
  /**
   * Set when a pinch ends with a finger still down, so the drag carries on
   * from where the pinch left the photo instead of jumping.
   */
  rebase: SharedValue<boolean>;
  /** Whether the current drag is a swipe to close. */
  dismissing: SharedValue<boolean>;
  /** Set once a swipe closes the photo, so a second swipe can't close twice. */
  closed: SharedValue<boolean>;
  /** How far a swipe to close has dragged the photo. */
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
}

function useZoom(size: Size | undefined) {
  const window = useWindowDimensions();
  return {
    closed: useSharedValue(false),
    dragX: useSharedValue(0),
    dragY: useSharedValue(0),
    dismissing: useSharedValue(false),
    focal: useSharedValue({ x: 0, y: 0 }),
    frame: { height: window.height, width: window.width },
    photo: useSharedValue<Size | null>(size ?? null),
    pinching: useSharedValue(false),
    rebase: useSharedValue(false),
    scale: useSharedValue(1),
    start: useSharedValue({ scale: 1, x: 0, y: 0 }),
    x: useSharedValue(0),
    y: useSharedValue(0),
  } satisfies Zoom;
}

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

/** Past an edge, a drag moves at a third of the finger's pace. */
function rubberBand(value: number, limit: number) {
  "worklet";
  if (value > limit) return limit + (value - limit) / 3;
  if (value < -limit) return -limit - (-limit - value) / 3;
  return value;
}

/** How far the photo can move each way at `scale` before an edge shows. */
function panLimits(zoom: Zoom, scale: number) {
  "worklet";
  const { frame } = zoom;
  const natural = zoom.photo.get();
  // `contain` fits the photo inside the frame; without its size yet, assume
  // it fills the frame.
  const known =
    natural !== null && natural.width > 0 && natural.height > 0
      ? natural
      : null;
  const fit =
    known === null
      ? 1
      : Math.min(frame.width / known.width, frame.height / known.height);
  const width = known === null ? frame.width : known.width * fit;
  const height = known === null ? frame.height : known.height * fit;
  return {
    x: Math.max(0, (width * scale - frame.width) / 2),
    y: Math.max(0, (height * scale - frame.height) / 2),
  };
}

/** Springs to `scale`, keeping `offset` within the edges at that scale. */
function springTo(zoom: Zoom, scale: number, offset: Point) {
  "worklet";
  const limits = panLimits(zoom, scale);
  zoom.scale.set(withSpring(scale, SETTLE));
  zoom.x.set(withSpring(clamp(offset.x, -limits.x, limits.x), SETTLE));
  zoom.y.set(withSpring(clamp(offset.y, -limits.y, limits.y), SETTLE));
}

function offsetOf(zoom: Zoom) {
  "worklet";
  return { x: zoom.x.get(), y: zoom.y.get() };
}

function springBack(zoom: Zoom) {
  "worklet";
  zoom.dragX.set(withSpring(0, SETTLE));
  zoom.dragY.set(withSpring(0, SETTLE));
}

function pinchGesture(zoom: Zoom) {
  const { frame } = zoom;
  return Gesture.Pinch()
    .onStart((event) => {
      zoom.pinching.set(true);
      // A pinch takes over from a swipe to close.
      zoom.dismissing.set(false);
      springBack(zoom);
      zoom.start.set({ scale: zoom.scale.get(), ...offsetOf(zoom) });
      zoom.focal.set({
        x: event.focalX - frame.width / 2,
        y: event.focalY - frame.height / 2,
      });
    })
    .onUpdate((event) => {
      const from = zoom.start.get();
      const origin = zoom.focal.get();
      const scale = clamp(from.scale * event.scale, MIN_PINCH_SCALE, MAX_SCALE);
      // Keeps the point that started under the fingers under them, and
      // follows the fingers as they move.
      const ratio = scale / from.scale;
      zoom.scale.set(scale);
      zoom.x.set(event.focalX - frame.width / 2 - ratio * (origin.x - from.x));
      zoom.y.set(event.focalY - frame.height / 2 - ratio * (origin.y - from.y));
    })
    .onEnd(() => {
      zoom.pinching.set(false);
      zoom.rebase.set(true);
      const scale = zoom.scale.get();
      if (scale <= 1) springTo(zoom, 1, { x: 0, y: 0 });
      else springTo(zoom, Math.min(scale, MAX_SCALE), offsetOf(zoom));
    });
}

/** Lets go of a swipe to close: closes, or springs back if it was short. */
function endDismiss(
  zoom: Zoom,
  event: PanGestureHandlerEventPayload,
  onClose: () => void,
) {
  "worklet";
  zoom.dismissing.set(false);
  if (zoom.closed.get()) return;
  const closing =
    event.translationY > DISMISS_DISTANCE ||
    (event.velocityY > DISMISS_VELOCITY && event.translationY > 0);
  if (!closing) {
    springBack(zoom);
    return;
  }
  zoom.closed.set(true);
  // Carries on off the bottom of the screen while the screen closes.
  const leave = { duration: 220 };
  zoom.dragX.set(withTiming(event.translationX + event.velocityX * 0.2, leave));
  zoom.dragY.set(withTiming(zoom.frame.height, leave));
  scheduleOnRN(onClose);
}

/** Lets go of a zoomed photo: a flick coasts, past an edge it springs back. */
function endPan(zoom: Zoom, event: PanGestureHandlerEventPayload) {
  "worklet";
  const limits = panLimits(zoom, zoom.scale.get());
  const offset = offsetOf(zoom);
  if (Math.abs(offset.x) > limits.x || Math.abs(offset.y) > limits.y) {
    springTo(zoom, zoom.scale.get(), offset);
    return;
  }
  zoom.x.set(
    withDecay({ clamp: [-limits.x, limits.x], velocity: event.velocityX }),
  );
  zoom.y.set(
    withDecay({ clamp: [-limits.y, limits.y], velocity: event.velocityY }),
  );
}

function panGesture(zoom: Zoom, onClose: () => void) {
  return Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      zoom.rebase.set(false);
      zoom.start.set({ scale: zoom.scale.get(), ...offsetOf(zoom) });
      zoom.dismissing.set(zoom.scale.get() <= 1.01 && !zoom.pinching.get());
    })
    .onUpdate((event) => {
      if (zoom.dismissing.get()) {
        zoom.dragX.set(event.translationX);
        zoom.dragY.set(event.translationY);
        return;
      }
      if (zoom.pinching.get()) return;
      if (zoom.rebase.get()) {
        zoom.rebase.set(false);
        zoom.start.set({
          scale: zoom.scale.get(),
          x: zoom.x.get() - event.translationX,
          y: zoom.y.get() - event.translationY,
        });
      }
      const from = zoom.start.get();
      const limits = panLimits(zoom, zoom.scale.get());
      zoom.x.set(rubberBand(from.x + event.translationX, limits.x));
      zoom.y.set(rubberBand(from.y + event.translationY, limits.y));
    })
    .onEnd((event) => {
      if (zoom.dismissing.get()) endDismiss(zoom, event, onClose);
      else if (!zoom.pinching.get()) endPan(zoom, event);
    });
}

/** Double-tap zooms in on the tapped point, or back out. */
function doubleTapGesture(zoom: Zoom) {
  const { frame } = zoom;
  return Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      if (zoom.scale.get() > 1.01) {
        springTo(zoom, 1, { x: 0, y: 0 });
        return;
      }
      springTo(zoom, DOUBLE_TAP_SCALE, {
        x: (event.x - frame.width / 2) * (1 - DOUBLE_TAP_SCALE),
        y: (event.y - frame.height / 2) * (1 - DOUBLE_TAP_SCALE),
      });
    });
}

/** How far a swipe to close has gone, from 0 (not at all) to 1. */
function dismissProgress(zoom: Zoom) {
  "worklet";
  return Math.min(1, Math.abs(zoom.dragY.get()) / (zoom.frame.height / 2));
}

/**
 * A full-screen photo you can pinch or double-tap to zoom, drag around once
 * zoomed, and swipe down to close. The black backdrop fades as the photo is
 * dragged away, showing the conversation behind it, like Photos.
 */
export function PhotoViewer({
  url,
  size,
  onClose,
  chrome,
}: {
  url: string;
  /** The photo's pixel size, when the message knows it. */
  size?: Size;
  onClose: () => void;
  /** Controls drawn over the photo; they fade out with the backdrop. */
  chrome?: ReactNode;
}) {
  const zoom = useZoom(size);
  const gesture = Gesture.Race(
    doubleTapGesture(zoom),
    Gesture.Simultaneous(pinchGesture(zoom), panGesture(zoom, onClose)),
  );

  // Each style refers to `zoom` itself: Reanimated only updates a style for
  // the shared values its own function captures, not a helper's.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: 1 - dismissProgress(zoom),
  }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: 1 - dismissProgress(zoom),
  }));
  const photoStyle = useAnimatedStyle(() => {
    // Shrinks a little as it's dragged away.
    const shrink = 1 - dismissProgress(zoom) * 0.25;
    return {
      transform: [
        { translateX: zoom.x.get() + zoom.dragX.get() },
        { translateY: zoom.y.get() + zoom.dragY.get() },
        { scale: zoom.scale.get() * shrink },
      ],
    };
  });

  return (
    <>
      <Animated.View
        className="bg-black"
        style={[StyleSheet.absoluteFill, backdropStyle]}
      />
      {/* Touches land on a frame that doesn't move, so their positions are
          in screen terms however the photo is zoomed. */}
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill}>
          <Animated.View style={[StyleSheet.absoluteFill, photoStyle]}>
            <Image
              source={{ uri: url }}
              contentFit="contain"
              transition={150}
              onLoad={(event) =>
                zoom.photo.set({
                  height: event.source.height,
                  width: event.source.width,
                })
              }
              style={{ flex: 1 }}
            />
          </Animated.View>
        </View>
      </GestureDetector>
      <Animated.View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, chromeStyle]}
      >
        {chrome}
      </Animated.View>
    </>
  );
}

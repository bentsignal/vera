/**
 * The photo viewer's state, shared by its gestures, and how it settles when
 * let go. Everything here that moves the photo runs on the UI thread.
 */
import type { SharedValue } from "react-native-reanimated";
import { useWindowDimensions } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  cancelAnimation,
  Easing,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type { Point, Sample, Size, Transform } from "./photo-transform";
import { pagePosition, pageTarget } from "./photo-pager";
import {
  dismissProgress,
  doubleTapTransform,
  exitDuration,
  IDENTITY,
  panLimits,
  settledTransform,
  shouldDismiss,
} from "./photo-transform";

// Critically damped: settling never overshoots past the screen's edges.
const SETTLE_SPRING = { dampingRatio: 1, duration: 350 } as const;

/**
 * What the fingers are doing:
 * - `idle`: no fingers down.
 * - `pending`: one finger down that hasn't moved far enough to drag; it may
 *   still be a tap.
 * - `zoom`: pinching, or dragging a zoomed photo around.
 * - `dismiss`: dragging a photo at fit, to swipe it closed.
 * - `page`: dragging a photo at fit sideways, to the next or previous one
 *   of a group (see `Pager`).
 */
export type Mode = "dismiss" | "idle" | "page" | "pending" | "zoom";

/**
 * The fingers' state, as of the last time their number changed. Each move
 * computes the photo's position from this baseline and where the fingers are
 * now, never from the last move, so nothing drifts or feeds back.
 */
export interface Track {
  mode: Mode;
  /** The fingers' center at the baseline. */
  origin: Point;
  /** How spread out the fingers were at the baseline; 0 for one finger. */
  spread: number;
  /** Where the photo was at the baseline, before rubber-banding. */
  base: Transform;
  /** Where the fingers have taken the photo, before rubber-banding. */
  raw: Transform;
  /**
   * How far the fingers' center has moved in all, carried across changes in
   * the number of fingers. A flick's speed comes from this, not from the
   * photo's position, which also moves as a pinch zooms around the fingers.
   */
  travel: Point;
  /** `travel` at the baseline. */
  travelBase: Point;
  /** Recent `travel` (or swipe-to-close drag) positions. */
  samples: Sample[];
  /** The fingers' last center. */
  focal: Point;
  /** Where the pager was when a sideways drag began (`page`). */
  pageFrom: number;
}

export const IDLE = {
  base: IDENTITY,
  focal: { x: 0, y: 0 },
  mode: "idle",
  origin: { x: 0, y: 0 },
  pageFrom: 0,
  raw: IDENTITY,
  samples: [],
  spread: 0,
  travel: { x: 0, y: 0 },
  travelBase: { x: 0, y: 0 },
} satisfies Track;

/** Everything the viewer's gestures read and move. */
export interface Viewer {
  /** The screen the photo fills, once measured. */
  frame: SharedValue<Size>;
  /** The photo's pixel size, once known. */
  photo: SharedValue<Size | null>;
  /** The zoom: how the photo is scaled and moved from the center. */
  scale: SharedValue<number>;
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** How far a swipe to close has dragged the photo. */
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  /** The point a swipe to close shrinks the photo around. */
  anchor: SharedValue<Point>;
  track: SharedValue<Track>;
  /** Set once the viewer is closing, so nothing can move it again. */
  closing: SharedValue<boolean>;
  /** Fades the whole viewer out when the close button is pressed. */
  fade: SharedValue<number>;
}

/**
 * A group of photos the viewer swipes through sideways: `position` is the
 * page shown, fractional mid-swipe, and `onTurn` hears the page a swipe
 * goes to as it's let go. The group draws one backdrop behind every page
 * (`backdrop`, its opacity), which the shown page fades as it's swiped
 * away: each page drawing its own moved it with the page, so the
 * conversation showed past the first and last pages and between them.
 */
export interface Pager {
  position: SharedValue<number>;
  count: number;
  onTurn: (index: number) => void;
  backdrop: SharedValue<number>;
  /**
   * Bumped by the group's close button, which sits still over the pages:
   * the shown page closes the viewer, as its own `close` does.
   */
  closeRequests: SharedValue<number>;
}

const PAGE_SPRING = { dampingRatio: 1, duration: 380 } as const;

/** Moves the pager with a sideways drag `dx` (window points) from where it began. */
export function dragPage(
  pager: Pager,
  from: number,
  dx: number,
  width: number,
) {
  "worklet";
  pager.position.set(pagePosition(from, dx, width, pager.count));
}

/**
 * Stops the pager where it is, for a sideways drag that starts while the
 * last one's spring is still running, and says where that is.
 */
export function catchPage(pager: Pager) {
  "worklet";
  cancelAnimation(pager.position);
  return pager.position.get();
}

/** Lets go of a sideways drag: on to the next page, or back. */
export function releasePage(
  pager: Pager,
  swipe: { from: number; dx: number; speedX: number; width: number },
) {
  "worklet";
  const target = pageTarget({ ...swipe, count: pager.count });
  // Now, not once it lands, so the page after it mounts during the spring.
  scheduleOnRN(pager.onTurn, target);
  pager.position.set(withSpring(target, PAGE_SPRING));
}

export function useViewer(size: Size | undefined) {
  const window = useWindowDimensions();
  return {
    anchor: useSharedValue({ x: 0, y: 0 }),
    closing: useSharedValue(false),
    dragX: useSharedValue(0),
    dragY: useSharedValue(0),
    fade: useSharedValue(1),
    frame: useSharedValue({ height: window.height, width: window.width }),
    photo: useSharedValue<Size | null>(size ?? null),
    scale: useSharedValue(1),
    track: useSharedValue<Track>(IDLE),
    x: useSharedValue(0),
    y: useSharedValue(0),
  } satisfies Viewer;
}

export function shownOf(viewer: Viewer) {
  "worklet";
  return { scale: viewer.scale.get(), x: viewer.x.get(), y: viewer.y.get() };
}

export function show(viewer: Viewer, transform: Transform) {
  "worklet";
  viewer.scale.set(transform.scale);
  viewer.x.set(transform.x);
  viewer.y.set(transform.y);
}

function springTo(viewer: Viewer, to: Transform) {
  "worklet";
  viewer.scale.set(withSpring(to.scale, SETTLE_SPRING));
  viewer.x.set(withSpring(to.x, SETTLE_SPRING));
  viewer.y.set(withSpring(to.y, SETTLE_SPRING));
}

export function stopAnimations(viewer: Viewer) {
  "worklet";
  cancelAnimation(viewer.scale);
  cancelAnimation(viewer.x);
  cancelAnimation(viewer.y);
  cancelAnimation(viewer.dragX);
  cancelAnimation(viewer.dragY);
}

/**
 * Lets go of a zoomed photo: back within its range and edges if it's past
 * them, and otherwise a flick coasts to a stop, bouncing off an edge.
 */
export function settle(viewer: Viewer, focal: Point, speed?: Point) {
  "worklet";
  const frame = viewer.frame.get();
  const photo = viewer.photo.get();
  const shown = shownOf(viewer);
  const target = settledTransform(frame, photo, shown, focal);
  if (target.scale !== shown.scale) {
    springTo(viewer, target);
    return;
  }
  const limits = panLimits(frame, photo, shown.scale);
  for (const axis of ["x", "y"] as const) {
    const value = viewer[axis];
    const limit = limits[axis];
    const fling = speed?.[axis] ?? 0;
    if (Math.abs(shown[axis]) > limit + 0.5 || limit === 0) {
      if (shown[axis] !== target[axis]) {
        value.set(
          withSpring(target[axis], { ...SETTLE_SPRING, velocity: fling }),
        );
      }
    } else if (fling !== 0) {
      value.set(
        withDecay({
          clamp: [-limit, limit],
          rubberBandEffect: true,
          rubberBandFactor: 0.9,
          velocity: fling,
        }),
      );
    }
  }
}

/**
 * Lets go of a swipe to close. Past the threshold or flicked down, the
 * photo carries on off the screen at the finger's speed, and only then does
 * the screen close; short of it, it springs back.
 */
export function release(viewer: Viewer, speed: Point, onClose: () => void) {
  "worklet";
  const dragY = viewer.dragY.get();
  if (!shouldDismiss(dragY, speed.y)) {
    viewer.dragX.set(withSpring(0, { ...SETTLE_SPRING, velocity: speed.x }));
    viewer.dragY.set(withSpring(0, { ...SETTLE_SPRING, velocity: speed.y }));
    return;
  }
  viewer.closing.set(true);
  // Far enough down that even a tall photo, shrunk around a point near its
  // top, is off the screen.
  const exit = viewer.frame.get().height * 1.2;
  const exitSpeed = Math.max(speed.y, 1500);
  const duration = exitDuration(exit - dragY, exitSpeed);
  const easing = Easing.out(Easing.quad);
  // An ease-out quad covers half the distance its starting speed would.
  viewer.dragX.set(
    withTiming(viewer.dragX.get() + (speed.x * duration) / 2000, {
      duration,
      easing,
    }),
  );
  viewer.dragY.set(
    withTiming(exit, { duration, easing }, (finished) => {
      if (finished === true) scheduleOnRN(onClose);
    }),
  );
}

/** Double-tap zooms in on the tapped point, or back out to fit. */
export function doubleTapGesture(viewer: Viewer) {
  return Gesture.Tap()
    .numberOfTaps(2)
    .maxDistance(24)
    .onEnd((event, success) => {
      if (!success || viewer.closing.get()) return;
      const frame = viewer.frame.get();
      const point = {
        x: event.x - frame.width / 2,
        y: event.y - frame.height / 2,
      };
      springTo(
        viewer,
        doubleTapTransform(frame, viewer.photo.get(), shownOf(viewer), point),
      );
    });
}

/** How much of the backdrop and controls a swipe to close has faded. */
export function fadeOf(viewer: Viewer) {
  "worklet";
  return (
    viewer.fade.get() *
    (1 - dismissProgress(viewer.dragY.get(), viewer.frame.get().height))
  );
}

/** How long the close button takes to fade the viewer out. */
const FADE_OUT = 180;

/** Fades the viewer out, then calls `onClose`. */
export function fadeOut(viewer: Viewer, onClose: () => void) {
  if (viewer.closing.get()) return;
  viewer.closing.set(true);
  viewer.fade.set(
    withTiming(0, { duration: FADE_OUT }, (finished) => {
      if (finished === true) scheduleOnRN(onClose);
    }),
  );
}

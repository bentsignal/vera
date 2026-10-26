/**
 * The photo viewer's touch tracking: pinching, dragging, and swiping to
 * close, all on the UI thread. The math is in `photo-transform.ts`.
 */
import type {
  GestureStateManager,
  GestureTouchEvent,
} from "react-native-gesture-handler";
import { Gesture } from "react-native-gesture-handler";

import type { Point } from "./photo-transform";
import type { Mode, Pager, Viewer } from "./photo-viewer-state";
import {
  addSample,
  bandDrag,
  bandTransform,
  centroid,
  liftSamples,
  MIN_SCALE,
  pinchTransform,
  spread,
  unBandDrag,
  unBandTransform,
  velocity,
} from "./photo-transform";
import {
  catchPage,
  dragPage,
  IDLE,
  release,
  releasePage,
  settle,
  show,
  shownOf,
  stopAnimations,
} from "./photo-viewer-state";

/** How far a finger moves before a touch counts as a drag. */
const SLOP = 6;

/**
 * The touches still down, from the center of the frame. In a group, the
 * frame slides with its page, so a sideways swipe tracks them in the
 * window instead (`window`): in the frame's terms, the page's own
 * movement fed back in, and it followed the finger at half speed and
 * wobbled.
 */
function fingers(
  viewer: Viewer,
  event: GestureTouchEvent,
  lifting: boolean,
  window = false,
) {
  "worklet";
  const frame = viewer.frame.get();
  // A lift's event still lists the lifted touches among all of them.
  const lifted = new Set(
    lifting ? event.changedTouches.map((touch) => touch.id) : [],
  );
  return event.allTouches
    .filter((touch) => !lifted.has(touch.id))
    .map((touch) => ({
      x: (window ? touch.absoluteX : touch.x) - frame.width / 2,
      y: (window ? touch.absoluteY : touch.y) - frame.height / 2,
    }));
}

/**
 * Starts a new baseline from where the fingers and photo are now. Called
 * whenever a finger lands or lifts, so the photo carries on from where it
 * is instead of jumping to the new fingers' center or spread.
 */
function rebase(viewer: Viewer, mode: Mode, points: Point[]) {
  "worklet";
  const track = viewer.track.get();
  const origin = centroid(points);
  viewer.track.set({
    ...track,
    base: track.raw,
    focal: origin,
    mode,
    origin,
    spread: spread(points),
    travelBase: track.travel,
  });
}

/**
 * Picks the photo up where it is, even mid-animation: the raw position is
 * the one that rubber-bands to what's on screen, so nothing jumps.
 */
function pickUp(viewer: Viewer) {
  "worklet";
  stopAnimations(viewer);
  const dragging =
    Math.abs(viewer.dragX.get()) > 0.5 || Math.abs(viewer.dragY.get()) > 0.5;
  const frame = viewer.frame.get();
  const raw = dragging
    ? {
        scale: 1,
        ...unBandDrag(
          { x: viewer.dragX.get(), y: viewer.dragY.get() },
          frame.height,
        ),
      }
    : unBandTransform(frame, viewer.photo.get(), shownOf(viewer));
  viewer.track.set({ ...IDLE, raw });
  return dragging;
}

function onTouchesDown(
  viewer: Viewer,
  event: GestureTouchEvent,
  manager: GestureStateManager,
) {
  "worklet";
  if (viewer.closing.get()) {
    manager.fail();
    return;
  }
  const points = fingers(viewer, event, false);
  const { mode } = viewer.track.get();
  // A sideways swipe stays one, whatever lands after it.
  if (mode === "page") return;
  if (mode === "idle") {
    manager.activate();
    // Caught while springing back from a swipe to close: keep swiping.
    const dragging = pickUp(viewer);
    if (dragging) {
      rebase(viewer, "dismiss", points);
      return;
    }
  }
  // A second finger starts a pinch, even at fit. A swipe to close stays one.
  const next =
    mode === "dismiss" ? "dismiss" : points.length > 1 ? "zoom" : mode;
  rebase(viewer, next === "idle" ? "pending" : next, points);
}

/**
 * Starts a sideways swipe through a group (`pager`) when one finger has
 * moved more across than down; true if it did. From here it's tracked in
 * the window (`inWindow`, see `fingers`).
 */
function startsPage(
  viewer: Viewer,
  points: Point[],
  inWindow: Point[],
  pager?: Pager,
) {
  "worklet";
  const track = viewer.track.get();
  const focal = centroid(points);
  const across = Math.abs(focal.x - track.origin.x);
  const down = Math.abs(focal.y - track.origin.y);
  if (pager === undefined || points.length !== 1 || across <= down) {
    return false;
  }
  rebase(viewer, "page", inWindow);
  // Caught mid-spring, it carries on from where it's drawn.
  viewer.track.set({ ...viewer.track.get(), pageFrom: catchPage(pager) });
  return true;
}

/** Moves a sideways swipe through a group with the finger, in the window. */
function movePage(viewer: Viewer, focal: Point, pager?: Pager) {
  "worklet";
  const track = viewer.track.get();
  if (pager === undefined) return;
  const dx = focal.x - track.origin.x;
  dragPage(pager, track.pageFrom, dx, viewer.frame.get().width);
  viewer.track.set({
    ...track,
    focal,
    samples: addSample(track.samples, { t: Date.now(), x: dx, y: 0 }),
  });
}

/** Lets go of a sideways swipe: on to the next photo, or back. */
function endPage(viewer: Viewer, pager?: Pager) {
  "worklet";
  const track = viewer.track.get();
  const speed = velocity(liftSamples(track.samples, Date.now()));
  viewer.track.set(IDLE);
  if (pager === undefined) return;
  releasePage(pager, {
    dx: track.focal.x - track.origin.x,
    from: track.pageFrom,
    speedX: speed.x,
    width: viewer.frame.get().width,
  });
}

/**
 * A finger that has moved far enough starts a drag: at fit, it swipes the
 * photo away (or sideways, to the next one of a group); zoomed in, it
 * moves the photo.
 */
function startDrag(
  viewer: Viewer,
  points: Point[],
  inWindow: Point[],
  pager?: Pager,
) {
  "worklet";
  const track = viewer.track.get();
  const focal = centroid(points);
  const moved = Math.hypot(focal.x - track.origin.x, focal.y - track.origin.y);
  if (moved < SLOP) return;
  const dismissing = viewer.scale.get() <= MIN_SCALE + 0.01;
  if (dismissing && startsPage(viewer, points, inWindow, pager)) return;
  if (dismissing) {
    viewer.anchor.set(track.origin);
    viewer.track.set({ ...track, raw: { scale: 1, x: 0, y: 0 } });
  }
  // The drag starts here, so the slop doesn't show as a jump.
  rebase(viewer, dismissing ? "dismiss" : "zoom", points);
}

function onTouchesMove(
  viewer: Viewer,
  event: GestureTouchEvent,
  pager: Pager | undefined,
) {
  "worklet";
  const points = fingers(viewer, event, false);
  const track = viewer.track.get();
  if (points.length === 0 || track.mode === "idle") return;
  const focal = centroid(points);
  if (track.mode === "pending") {
    startDrag(viewer, points, fingers(viewer, event, false, true), pager);
    return;
  }
  const now = Date.now();
  const frame = viewer.frame.get();
  if (track.mode === "page") {
    movePage(viewer, centroid(fingers(viewer, event, false, true)), pager);
    return;
  }
  if (track.mode === "dismiss") {
    const raw = {
      scale: 1,
      x: track.base.x + focal.x - track.origin.x,
      y: track.base.y + focal.y - track.origin.y,
    };
    const drag = bandDrag(raw, frame.height);
    viewer.dragX.set(drag.x);
    viewer.dragY.set(drag.y);
    viewer.track.set({
      ...track,
      focal,
      raw,
      samples: addSample(track.samples, { t: now, x: drag.x, y: drag.y }),
    });
    return;
  }
  // Two or more fingers zoom by how much farther apart they've moved; one
  // finger drags with a ratio of 1.
  const nowSpread = spread(points);
  const ratio =
    track.spread > 0 && nowSpread > 0 ? nowSpread / track.spread : 1;
  const raw = pinchTransform(track.base, track.origin, focal, ratio);
  show(viewer, bandTransform(frame, viewer.photo.get(), raw));
  const travel = {
    x: track.travelBase.x + focal.x - track.origin.x,
    y: track.travelBase.y + focal.y - track.origin.y,
  };
  viewer.track.set({
    ...track,
    focal,
    raw,
    samples: addSample(track.samples, { t: now, ...travel }),
    travel,
  });
}

function onTouchesUp(
  viewer: Viewer,
  event: GestureTouchEvent,
  manager: GestureStateManager,
  { onClose, pager }: { onClose: () => void; pager?: Pager },
) {
  "worklet";
  const points = fingers(viewer, event, true);
  const track = viewer.track.get();
  if (track.mode === "idle") return;
  if (track.mode === "page") {
    // A sideways swipe ends with its first finger.
    manager.end();
    endPage(viewer, pager);
    return;
  }
  if (points.length > 0) {
    // Fewer fingers: carry on from here with the ones still down.
    rebase(viewer, track.mode, points);
    return;
  }
  const speed = velocity(liftSamples(track.samples, Date.now()));
  viewer.track.set(IDLE);
  manager.end();
  if (track.mode === "dismiss") release(viewer, speed, onClose);
  else settle(viewer, track.focal, track.mode === "zoom" ? speed : undefined);
}

/**
 * Pinching, dragging, and swiping to close, all from raw touches. Tracking
 * the fingers directly, rather than combining a pinch and a pan gesture,
 * keeps the photo continuous when fingers land or lift mid-gesture, the same
 * way on both platforms.
 */
export function touchGesture(
  viewer: Viewer,
  onClose: () => void,
  pager?: Pager,
) {
  return Gesture.Manual()
    .onTouchesDown((event, manager) => onTouchesDown(viewer, event, manager))
    .onTouchesMove((event) => onTouchesMove(viewer, event, pager))
    .onTouchesUp((event, manager) =>
      onTouchesUp(viewer, event, manager, { onClose, pager }),
    )
    .onTouchesCancelled((event, manager) =>
      onTouchesUp(
        viewer,
        { ...event, changedTouches: event.allTouches },
        manager,
        { onClose, pager },
      ),
    );
}

import type { View } from "react-native";
import type { AnimatedRef, SharedValue } from "react-native-reanimated";
import {
  Easing,
  makeMutable,
  measure,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import type { Blank } from "./blank-space";

// How the messages move as a row's space opens or closes (see `Move`), for
// `grow.tsx` and the rows that open (see `Arrive`).

/**
 * How long the messages take to move when a row's space opens or closes,
 * and how: a gentle start and a long settle, about the pace of the
 * keyboard and the app's sheets. (An ease-out cubic over 260ms was done
 * before you saw it start.)
 */
export const GROW_MS = 420;
export const GROW_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);
/** How far into the move what it makes room for starts to show. */
const ROOM_MS = GROW_MS / 4;
/** Frames to wait for a change to reach the screen before moving on. */
const LAND_TRIES = 30;

/**
 * A row that gains or loses space (its first reaction arrives, or its last
 * goes; a new message opens under it; someone starts typing) changes the
 * list's layout once, at full size. Animating the space's height instead
 * re-lays out every row in the list each frame, which ran at 30fps. In
 * that same frame, everything the change moved is drawn back where it was
 * (a transform, which takes no layout) and eases into place.
 *
 * What moves: in an inverted list kept still from the bottom, a row that
 * grows pushes everything above its new space up (older rows, and the
 * pieces of the row itself above the space, see `usePieceLift`), and
 * nothing below it. In a thread with room under its replies, the room
 * changes with it, so the thread's top stays put and what's below the
 * space moves instead (see `blank`).
 *
 * The space and the moves must reach the screen in the same frame, or the
 * messages jump for a frame. Reanimated sends transforms straight to the
 * view, but a height through a layout commit, which waits while React is
 * committing too (as the list re-renders around a new reaction). So
 * while a move is `pending`, the styles it moves carry a prop that also
 * takes the commit (`IN_COMMIT`), and land with the height; once the
 * height is on screen, they go back to the fast path.
 */
export interface Move {
  /** The growing row's order (see `rowOrder`). */
  readonly pivot: SharedValue<number>;
  /** Where in that row the space is (see `Place`). */
  readonly place: SharedValue<number>;
  /** The whole row is new: none of its own pieces move. */
  readonly whole: SharedValue<boolean>;
  /** How far what moved above the space is drawn from where it's laid out. */
  readonly offset: SharedValue<number>;
  /** The same below it, which only moves in a thread (see `blank`). */
  readonly below: SharedValue<number>;
  /**
   * The rows closing together, as a deleted message and its time header
   * do (see `useClose`), or `NONE`.
   */
  readonly batch: SharedValue<number>;
  /** Its space hasn't reached the screen yet. */
  readonly pending: SharedValue<boolean>;
}

/** Moves at once: a message, its time header, and typing, together. */
export const MOVES = 4;

export interface Growth {
  readonly moves: readonly Move[];
  /** The list, to tell whether a row is on screen. */
  readonly list: AnimatedRef<View>;
  /** The space under the newest message for who's typing. */
  readonly typing: SharedValue<number>;
  /** How far below that space the indicator is drawn (see `useTypingDrop`). */
  readonly typingDrop: SharedValue<number>;
  /** Whether that's down by the composer, for React. */
  readonly typingDropped: boolean;
  /**
   * A thread's blank space, which moves the rows as it changes: it's
   * updated with the row's size at once, so the rows move once, and the
   * thread's original stays put while its replies move.
   */
  readonly blank?: Blank;
  /**
   * Counts moves as they start to ease, for the list's room for the
   * composer to close with after a send (see `useComposerRoom`).
   */
  readonly moving?: SharedValue<number>;
}

/** No row is growing: no order is below it. No rows closing together. */
export const NONE = -1;

/**
 * A style prop that doesn't change how anything looks and that Reanimated
 * doesn't send straight to the view, so a style carrying it lands in the
 * same layout commit as a space opening (see `Move`).
 */
const IN_COMMIT = { backfaceVisibility: "visible" } as const;

export function newMove() {
  return {
    batch: makeMutable(NONE),
    below: makeMutable(0),
    offset: makeMutable(0),
    pending: makeMutable(false),
    pivot: makeMutable(NONE),
    place: makeMutable(0),
    whole: makeMutable(false),
  };
}

/** Where a space is, and what it moves. */
export interface Pivot {
  /** The row's order (see `rowOrder`). */
  order: number;
  /** Where in the row the space is (see `Place`). */
  place: number;
  /** The whole row is new (see `Move`). */
  whole?: boolean;
  /** Rows closing together (see `useClose`); `NONE` for none. */
  batch?: number;
}

/** Whether `move` is the one already going for this space (see `Pivot`). */
function sameSpace(move: Move, pivot: Pivot) {
  "worklet";
  const { order, place, whole = false } = pivot;
  // Read here, not as a default: a worklet doesn't capture defaults.
  const batch = pivot.batch ?? NONE;
  if (batch !== NONE && move.batch.get() === batch) return true;
  return (
    move.pivot.get() === order &&
    move.place.get() === place &&
    move.whole.get() === whole
  );
}

/** The move already going for the same space, or a free one. */
function moveFor(growth: Growth, pivot: Pivot) {
  "worklet";
  let free: Move | undefined;
  for (const move of growth.moves) {
    if (sameSpace(move, pivot)) return move;
    // At rest, or the closest to it when all are moving.
    if (
      free === undefined ||
      Math.abs(move.offset.get()) < Math.abs(free.offset.get())
    ) {
      free = move;
    }
  }
  return free;
}

/** Whether the row measured by `measured` is below the bottom of the list. */
function belowScreen(growth: Growth, measured: AnimatedRef<View>) {
  "worklet";
  const row = measure(measured);
  const list = measure(growth.list);
  if (row === null || list === null) return false;
  return row.pageY + row.height > list.pageY + list.height + 1;
}

/**
 * Updates a thread's blank space for content that changed by `delta`,
 * and returns how much the list's inset changed with it, which moves
 * every row by that much. The inset is the larger of the blank space and
 * the room for the keyboard and composer (`floor`): once a thread's blank
 * space is less than that, a new reply moves the rows above it up as in a
 * conversation, and counting the whole change in blank space drew them
 * short of where they went, so they snapped the rest of the way.
 */
function blankChange(blank: Blank | undefined, delta: number) {
  "worklet";
  if (blank === undefined) return 0;
  const floor = blank.floor.get();
  const content = blank.content.get() + delta;
  const before = Math.max(blank.space.get(), floor);
  const space = Math.max(0, blank.list.get() - content);
  blank.content.set(content);
  blank.space.set(space);
  return Math.max(space, floor) - before;
}

/**
 * Draws what a space at `pivot` moves as before it changed by `delta`,
 * then eases it into place. Rows closing in the same `batch` move what's
 * above the newest of them once, by all their heights. Call it in the same frame callback that
 * changes the space (see `inFrame`). A row below the bottom of the screen
 * moves nothing: the list's scroll anchor keeps what's on screen still
 * then.
 */
export function startMove(
  growth: Growth,
  pivot: Pivot,
  delta: number,
  measured: AnimatedRef<View>,
) {
  "worklet";
  if (delta === 0 || belowScreen(growth, measured)) return undefined;
  const move = moveFor(growth, pivot);
  if (move === undefined) return undefined;
  const batch = pivot.batch ?? NONE;
  const together = batch !== NONE && move.batch.get() === batch;
  // The same space again mid-move adds to it, as rows closing together do.
  const carries = sameSpace(move, pivot);
  const moved = blankChange(growth.blank, delta);
  move.pivot.set(
    together ? Math.max(move.pivot.get(), pivot.order) : pivot.order,
  );
  move.place.set(pivot.place);
  move.whole.set(pivot.whole ?? false);
  move.batch.set(batch);
  move.pending.set(true);
  move.offset.set((carries ? move.offset.get() : 0) + delta + moved);
  move.below.set((carries ? move.below.get() : 0) + moved);
  // Easing from the frame after, once the change is on screen: the frame
  // that lays it out can run long, and an ease started with it would skip
  // ahead by as much.
  requestAnimationFrame(() => {
    const ease = { duration: GROW_MS, easing: GROW_EASING };
    growth.moving?.set(growth.moving.get() + 1);
    move.below.set(withTiming(0, ease));
    move.offset.set(
      withTiming(0, ease, (finished) => {
        if (finished === true) move.batch.set(NONE);
      }),
    );
  });
  return move;
}

/**
 * Waits, from the next frame, for `measured` to be `height` tall in the
 * list's layout, then lets `move` go back to the fast path (see `Move`)
 * and calls `done`.
 */
export function land({
  move,
  measured,
  height,
  done,
}: {
  move: Move | undefined;
  measured: AnimatedRef<View>;
  height: number;
  done?: () => void;
}) {
  "worklet";
  let tries = 0;
  function check() {
    const now = measure(measured);
    const there = now !== null && Math.abs(now.height - height) < 0.5;
    if (!there && tries < LAND_TRIES) {
      tries += 1;
      requestAnimationFrame(check);
      return;
    }
    move?.pending.set(false);
    done?.();
  }
  requestAnimationFrame(check);
}

/**
 * An opacity, to 1, for something drawn where it ends up while the
 * messages move off it to make room: it shows as they clear it, so it
 * never shows over them.
 */
export function showWithRoom() {
  "worklet";
  return withDelay(
    ROOM_MS,
    withTiming(1, { duration: GROW_MS - ROOM_MS, easing: GROW_EASING }),
  );
}

/**
 * Runs `change` at the start of the next frame. Every space and move set
 * in one such callback has its styles worked out together, after it, so
 * they reach the screen in the same frame (see `Move`); and a space that
 * just mounted has its style hooked up by then.
 */
export function inFrame(change: () => void) {
  "worklet";
  requestAnimationFrame(change);
}

/**
 * How far the moves draw a row at `order` from where it's laid out: rows
 * older than a growing one, and, `withOwn`, the growing row itself, move
 * with what's above the space; newer ones with what's below it.
 */
export function rowShift(
  moves: readonly Move[],
  order: number,
  withOwn: boolean,
) {
  "worklet";
  let shift = 0;
  let pending = false;
  for (const move of moves) {
    const pivot = move.pivot.get();
    // A space at the top of a row (see `Settle`) leaves the row below it.
    const own =
      withOwn && !move.whole.get() && pivot === order && move.place.get() >= 0;
    let by = 0;
    if (pivot > order || own) by = move.offset.get();
    else if (pivot < order) by = move.below.get();
    shift += by;
    if (by !== 0 && move.pending.get()) pending = true;
  }
  return { pending, shift };
}

/** Whether any space hasn't reached the screen yet (see `Move`). */
export function anyPending(moves: readonly Move[]) {
  "worklet";
  for (const move of moves) {
    if (move.pending.get()) return true;
  }
  return false;
}

/** A transform to `translateY`, in the layout commit while it's `pending`. */
export function moved(translateY: number, pending: boolean) {
  "worklet";
  const style = { transform: [{ translateY }] };
  return pending ? { ...style, ...IN_COMMIT } : style;
}

/** How far one move of its own row draws the piece at `place`. */
function pieceBy(move: Move, place: number, rowMoves: boolean) {
  "worklet";
  const above = move.place.get() > place;
  // As in `rowShift`: a space at a row's top doesn't move the row.
  const rowGoes = rowMoves && move.place.get() >= 0;
  if (above) return rowGoes ? 0 : move.offset.get();
  return move.below.get() - (rowGoes ? move.offset.get() : 0);
}

/** How far the moves draw a piece of a row from where it's laid out. */
export function pieceShift(
  moves: readonly Move[],
  {
    order,
    place,
    rowMoves,
  }: { order: number; place: number; rowMoves: boolean },
) {
  "worklet";
  let shift = 0;
  let pending = false;
  for (const move of moves) {
    if (move.pivot.get() !== order || move.whole.get()) continue;
    const by = pieceBy(move, place, rowMoves);
    shift += by;
    if (by !== 0 && move.pending.get()) pending = true;
  }
  return { pending, shift };
}

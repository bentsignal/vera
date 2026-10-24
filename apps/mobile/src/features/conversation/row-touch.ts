import type { RefObject } from "react";
import type { GestureResponderEvent, View } from "react-native";
import { createContext, use, useId, useImperativeHandle } from "react";

import type { MenuTarget } from "./glass-message-menu";

/** The actions (a hold) or who reacted (a double tap). */
export type LiftMode = MenuTarget["mode"];

/** What a touch on a message's row landed on: the row, or a part's text. */
export type TouchedPart = "row" | { readonly openMenu: () => void };

/**
 * Where the latest touch landed, as the row or a part with its own menu
 * reports it, and when the row's gesture seeing it began. One touch lands
 * at a time, so they're kept for every row at once.
 */
let touch: { at: number; part: TouchedPart } | undefined;
let gestureBegan = 0;

/**
 * A touch's report counts for the gesture that began up to this long after
 * it: the touch reaches the gesture and the Pressables separately, and the
 * JavaScript thread can be busy between them. Two touches are never this
 * close.
 */
const REPORT_SLACK_MS = 250;

/** Says the latest touch landed on the row, or on a part with a menu. */
export function reportTouch(part: TouchedPart) {
  touch = { at: Date.now(), part };
}

/** Marks a row's gesture beginning, for a new touch. */
export function rowGestureBegan() {
  gestureBegan = Date.now();
}

/** Whether something at this time belongs to the row gesture's touch. */
export function ofLatestTouch(at: number) {
  return at >= gestureBegan - REPORT_SLACK_MS;
}

/**
 * What the row gesture's touch landed on: the row, a part with a menu, or
 * null for something with a press of its own (a photo, a reaction).
 */
export function touchedPart() {
  if (touch === undefined || !ofLatestTouch(touch.at)) {
    return null;
  }
  return touch.part;
}

/** Something a hold lifts with its menu, squeezing it while held. */
export interface Liftable {
  readonly lift: () => void;
  readonly pressIn: () => void;
  readonly release: () => void;
}

/**
 * What a hold or double tap across a message's row lifts, given the
 * touch's height on screen: the whole message for a bubble, the whole row
 * for a stacked message, or the part of it there (see `useRowTarget`).
 */
export interface RowTarget {
  readonly lift: (y: number) => void;
  readonly pressIn: (y: number) => void;
  readonly release: () => void;
}

/** A part of a message with a menu of its own, and where it sits. */
interface PartTarget extends Liftable {
  readonly measured: RefObject<View | null>;
}

/** What each message row lifts, by the row's ID (see `useRowTarget`). */
const rowTargets = new Map<string, RowTarget>();
/** Each row's parts with menus of their own (see `usePartTarget`). */
const partTargets = new Map<string, Map<string, PartTarget>>();
/** The rows held right now, which squeeze once their part is found. */
const heldRows = new Set<string>();

/** The message row around, by its ID. */
export const RowIdContext = createContext<string | null>(null);

/**
 * Lets a hold or double tap beside a part of a message, at its height in
 * the row, lift the part as a hold on it does (see `useRowTarget`). Leaves
 * it be when undefined, as for a message still sending.
 */
export function usePartTarget(target: PartTarget | undefined) {
  const row = use(RowIdContext);
  const id = useId();
  useImperativeHandle(
    target === undefined || row === null
      ? null
      : (handle: PartTarget | null) => {
          const parts = partTargets.get(row) ?? new Map<string, PartTarget>();
          if (handle === null) parts.delete(id);
          else parts.set(id, handle);
          if (parts.size === 0) partTargets.delete(row);
          else partTargets.set(row, parts);
        },
    () => ({
      lift: () => target?.lift(),
      measured: target?.measured ?? { current: null },
      pressIn: () => target?.pressIn(),
      release: () => target?.release(),
    }),
  );
}

/** How far `part` sits from the height `y` on screen; 0 across it. */
function distanceTo(part: PartTarget, y: number) {
  return new Promise<number>((resolve) => {
    const view = part.measured.current;
    if (view === null) {
      resolve(Infinity);
      return;
    }
    view.measureInWindow((_x, top, _width, height) =>
      resolve(Math.max(top - y, y - top - height, 0)),
    );
  });
}

/**
 * Hands `found` the part of the row `id` at the height `y`, the nearest
 * one when `nearest`, or undefined when there's none there.
 */
function findPart(
  id: string,
  { y, nearest }: { y: number; nearest: boolean },
  found: (part: Liftable | undefined) => void,
) {
  const parts = [...(partTargets.get(id)?.values() ?? [])];
  void Promise.all(parts.map((part) => distanceTo(part, y))).then(
    (distances) => {
      const closest = Math.min(...distances);
      const index = distances.indexOf(closest);
      const there = nearest ? closest < Infinity : closest === 0;
      found(there ? parts[index] : undefined);
    },
  );
}

/**
 * Makes `whole` what a hold or double tap across the message's row lifts.
 * With `parts` (a message of several parts), one beside a part with its
 * own menu lifts that part instead: the nearest one (`nearest`, bubbles,
 * which have nothing else to lift) or the one across the touch (`across`,
 * stacked rows, which lift whole beside their text and name). Leaves the
 * row be when `whole` is undefined.
 */
export function useRowTarget(
  whole: Liftable | undefined,
  parts?: "across" | "nearest",
) {
  const id = use(RowIdContext);
  function at(y: number, then: (target: Liftable) => void) {
    if (whole === undefined || id === null) return;
    if (parts === undefined) {
      then(whole);
      return;
    }
    findPart(id, { nearest: parts === "nearest", y }, (part) =>
      then(part ?? whole),
    );
  }
  useImperativeHandle(
    whole === undefined || id === null
      ? null
      : (handle: RowTarget | null) => {
          if (handle === null) rowTargets.delete(id);
          else rowTargets.set(id, handle);
        },
    () => ({
      lift: (y) => at(y, (target) => target.lift()),
      pressIn: (y) => {
        if (id !== null) heldRows.add(id);
        at(y, (target) => {
          if (id !== null && heldRows.has(id)) target.pressIn();
        });
      },
      release: () => {
        if (id === null) return;
        heldRows.delete(id);
        whole?.release();
        for (const part of partTargets.get(id)?.values() ?? []) part.release();
      },
    }),
  );
}

/** What the row `id` lifts (see `useRowTarget`), once it's registered. */
export function rowTarget(id: string) {
  return rowTargets.get(id);
}

/**
 * A part's hold, which pressables inside it take on (see `useMenuPress`):
 * the row's, or a part's own, which ignores where the touch is.
 */
export interface MenuPress {
  readonly delayLongPress: number;
  readonly onLongPress: (event: GestureResponderEvent) => void;
  readonly onPressIn: (event: GestureResponderEvent) => void;
  readonly onPressOut: () => void;
}

/** A part's hold, which pressables inside it take on (see `useMenuPress`). */
export const MenuPressContext = createContext<MenuPress | null>(null);

/**
 * The hold of the part around it, for a pressable inside it (a link in a
 * message's text), which would otherwise take the hold from the part.
 * Null in the lifted copy.
 */
export function useMenuPress() {
  return use(MenuPressContext);
}

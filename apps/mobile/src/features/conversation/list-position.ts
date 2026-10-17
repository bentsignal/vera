import type { RefObject } from "react";
import type { FlatList } from "react-native";
import { useRef } from "react";
import { Platform } from "react-native";
import { useSharedValue } from "react-native-reanimated";

import type { MessageRow } from "./build-rows";

// Where the conversation list is scrolled: placing it when it opens, and
// keeping up with the newest message.

/**
 * How close to the newest message (in points) still counts as being there
 * for the jump button, which stays hidden.
 */
const NEAR_LATEST = 80;
/**
 * How far from the bottom still counts as at the bottom, so the list stays
 * pinned there: a scroll up by more than this lets go.
 */
const PIN_SLOP = 4;
/** Frames to wait for the message a conversation opens on to be measured. */
const ANCHOR_TRIES = 30;

interface LatestState {
  /** The keyboard's inset (iOS), which the newest message sits above. */
  inset: number;
  pinned: boolean;
  /** You're dragging the list, or it's still moving from a fling. */
  scrolling: boolean;
  /** The newest row and the composer's height when content last changed. */
  seen?: { newest: string | undefined; composer: number };
}

/**
 * Keeps the list on the newest message while you're at the bottom, and
 * lets go the moment you scroll up.
 *
 * The native scroll anchor (`maintainVisibleContentPosition`, see
 * `ANCHOR`) always keeps what's on screen still when rows are added below
 * it. So a new message lands just below the screen, laid out once at its
 * full size, and when the list is pinned it then slides into view with the
 * platform's own animated scroll: no layout or JavaScript runs per frame.
 * Only your own drag or fling unpins it (the keyboard lifting the list
 * never does), and reaching the bottom pins it again.
 *
 * On iOS the keyboard lifts the list with a top content inset, so the
 * bottom is at minus that inset rather than 0.
 */
export function useLatest(
  listRef: RefObject<FlatList<MessageRow> | null>,
  pinnedAtStart: boolean,
) {
  const isNearLatest = useSharedValue(pinnedAtStart);
  const state = useRef<LatestState>({
    inset: 0,
    pinned: pinnedAtStart,
    scrolling: false,
  });
  function bottom() {
    return Platform.OS === "ios" ? -state.current.inset : 0;
  }
  function scrollToNewest() {
    listRef.current?.scrollToOffset({ animated: true, offset: bottom() });
  }
  return {
    isNearLatest,
    scrollToNewest,
    /** Scrolls down to the newest message, as after sending one. */
    scrollToLatest: () => {
      state.current.pinned = true;
      scrollToNewest();
    },
    onInsetChange: (top: number) => {
      state.current.inset = top;
    },
    scrollHandlers: {
      onScrollBeginDrag: () => {
        state.current.scrolling = true;
      },
      onMomentumScrollEnd: () => {
        state.current.scrolling = false;
      },
      onScrollEndDrag: (event: {
        nativeEvent: { velocity?: { y: number } };
      }) => {
        // No fling: the scroll ends with the drag.
        if ((event.nativeEvent.velocity?.y ?? 0) === 0) {
          state.current.scrolling = false;
        }
      },
    },
    onScroll: (offset: number) => {
      const fromBottom = offset - bottom();
      isNearLatest.set(fromBottom < NEAR_LATEST);
      if (fromBottom <= PIN_SLOP) state.current.pinned = true;
      else if (state.current.scrolling) state.current.pinned = false;
    },
    /**
     * The list's content changed. Pinned, a new message (`newest`) or a
     * taller composer (`composer`) slides into view below what's there.
     * Anything else (a row growing as a reaction makes room) leaves the
     * scroll alone: the newest message stays put and the rows above move
     * up, and following it would restart the scroll every frame.
     */
    onContentChange: (newest: string | undefined, composer: number) => {
      const seen = state.current.seen;
      state.current.seen = { composer, newest };
      if (seen === undefined) return;
      const grew = newest !== seen.newest || composer !== seen.composer;
      if (!grew || !state.current.pinned) return;
      scrollToNewest();
      // Android's scroll anchor moves the list after this, holding the
      // newest message still while the space under it opens (behind the
      // composer, which is solid there), so it follows a frame later too.
      if (Platform.OS === "android") requestAnimationFrame(scrollToNewest);
    },
  };
}

/**
 * The scroll anchor: the first row on screen, from the newest message up,
 * stays where it is when rows are added or grow below it. (The list skips
 * its header, the space under the newest message for the composer, on its
 * own, so index 0 is the newest message.)
 */
export const ANCHOR = { minIndexForVisible: 0 };

export type Latest = ReturnType<typeof useLatest>;

interface PlacementState {
  /** The last scroll to the anchor missed: its row isn't measured yet. */
  missed: boolean;
  placed: boolean;
  started: boolean;
}

/** Scrolls to the anchor's row, trying again each frame until it can. */
function scrollToAnchor(attempt: {
  listRef: RefObject<FlatList<MessageRow> | null>;
  index: number;
  state: PlacementState;
  tries: number;
  done: () => void;
}) {
  const { listRef, index, state, tries, done } = attempt;
  state.missed = false;
  listRef.current?.scrollToIndex({ animated: false, index, viewPosition: 0.5 });
  if (missedAgain(state) && tries < ANCHOR_TRIES) {
    requestAnimationFrame(() =>
      scrollToAnchor({ ...attempt, tries: tries + 1 }),
    );
  } else {
    done();
  }
}

/** Read through a call: `onScrollToIndexFailed` sets it during the scroll. */
function missedAgain(state: PlacementState) {
  return state.missed;
}

/**
 * Puts the list at its starting place once it's laid out, then shows it:
 * the newest message, or centered on the message it opened on. The list
 * can't scroll to a row it hasn't measured yet, so that tries again each
 * frame until it has. Until it's placed, it pages in nothing (at first it
 * sits at the newest loaded message, which would ask for newer ones).
 */
export function usePlacement({
  listRef,
  anchorIndex,
  onReady,
  onLoadNewer,
  onLoadOlder,
}: {
  listRef: RefObject<FlatList<MessageRow> | null>;
  anchorIndex: number;
  onReady: () => void;
  onLoadNewer: () => void;
  onLoadOlder: () => void;
}) {
  const state = useRef<PlacementState>({
    missed: false,
    placed: false,
    started: false,
  });
  function place() {
    state.current.placed = true;
    onReady();
  }
  return {
    /** Pages in older messages, once placed. */
    loadOlder: () => {
      if (state.current.placed) onLoadOlder();
    },
    /** Pages in newer messages, once placed. */
    loadNewer: () => {
      if (state.current.placed) onLoadNewer();
    },
    /** The list has laid out its content. */
    onLaidOut: () => {
      if (state.current.started) return;
      state.current.started = true;
      if (anchorIndex === -1) {
        place();
        return;
      }
      scrollToAnchor({
        done: () => {
          place();
          // Newer messages, in case it opened close enough to them that
          // the list won't ask again.
          onLoadNewer();
        },
        index: anchorIndex,
        listRef,
        state: state.current,
        tries: 0,
      });
    },
    onMissed: () => {
      state.current.missed = true;
    },
  };
}

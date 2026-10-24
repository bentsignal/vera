import type { RefObject } from "react";
import type { FlatList } from "react-native";
import type Animated from "react-native-reanimated";
import type { AnimatedRef, SharedValue } from "react-native-reanimated";
import { useRef } from "react";
import { Platform } from "react-native";
import { useKeyboardHandler } from "react-native-keyboard-controller";
import {
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useDerivedValue,
  useScrollOffset,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import type { ComposerHeight } from "./composer-height";
import type { ListRow } from "./typing-row";
import { useComposerRoom } from "./composer-height";

// Where the conversation list is scrolled: placing it when it opens, and
// keeping up with the newest message.

/**
 * How close to the newest message (in points) still counts as being there
 * for the jump button, which stays hidden.
 */
const NEAR_LATEST = 80;
/**
 * How quickly the list glides down to the newest message: the distance
 * left shrinks by e every this many milliseconds, so it's most of the way
 * there in a fifth of a second and eases into place.
 */
const GLIDE_MS = 70;
/**
 * Close enough to the bottom to finish the glide there in one step: the
 * scroll position snaps to whole pixels, so smaller steps never land.
 */
const GLIDE_DONE = 2;
/** The longest a glide takes before it jumps the rest of the way. */
const GLIDE_MAX_MS = 1000;
/** Frames to wait for the message a conversation opens on to be measured. */
const ANCHOR_TRIES = 30;
/**
 * Frames to wait, as a conversation opens at its newest message, for the
 * list's insets to reach its scroll view (see `openAt`).
 */
const OPEN_TRIES = 30;

const IOS = Platform.OS === "ios";

/**
 * Keeps track of how far the list is from the newest message, and takes it
 * there.
 *
 * Nothing here keeps the list at the bottom as things change: the native
 * scroll anchor (`maintainVisibleContentPosition`, see `ANCHOR`) keeps the
 * newest row on screen still as rows above it are added or grow, so at the
 * bottom a new message, or someone typing, opens right there and the
 * messages above make room (see `Arrive`); scrolled up, nothing on screen
 * moves. The keyboard and, on iOS, the composer under the newest row are
 * insets (`KeyboardChatScrollView`'s, with the composer as its
 * `extraContentPadding`) that the list moves with on the UI thread as
 * they change. The composer used to be a row under the newest message
 * there, and the anchor moved the list when it changed size, as when a
 * reply was sent: it ended up that much under the composer.
 *
 * On Android the composer stays a row (`composerRow`). The library draws
 * an Android inset by shifting the list's content and scrolling by as
 * much, and the scroll events it sends don't match where the list ends
 * up: at the bottom it reported the list a composer's height up, which
 * showed the jump button, and the newest message ended up under a
 * composer that grew. The anchor holds the rows still as the row grows,
 * so at the bottom the list then glides down to show what it covers
 * (`onContentChange`).
 *
 * Going to the newest message (after sending, or the jump button) glides
 * there on the UI thread, each frame from wherever the list actually is.
 * The platform's animated scroll stops as soon as anything else sets the
 * scroll position, as the anchor does when a message arrives under what's
 * on screen, which left the list short of the bottom.
 *
 * On iOS the insets are the scroll view's top content inset, so the bottom
 * is at minus that inset rather than 0. On Android they're drawn in, and
 * the bottom stays at 0.
 */
export function useLatest({
  startsAtLatest,
  composerHeight,
  keyboardOffset,
  blankSpace,
  freeze,
}: {
  /** It opens on the newest message, not one further up. */
  startsAtLatest: boolean;
  /** The composer's height, which floats over the list's bottom. */
  composerHeight: ComposerHeight;
  /** What the keyboard covers that's already room (its `offset`). */
  keyboardOffset: number;
  /** A thread's room under its replies (see `useBlankSpace`). */
  blankSpace: SharedValue<number> | undefined;
  /** Freezes keyboard handling (see `useMenuKeyboard`). */
  freeze: SharedValue<boolean>;
}) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const offset = useScrollOffset(scrollRef);
  const { live, laidOut = 0 } = composerHeight;
  const { room: composer, moving, settled } = useComposerRoom(composerHeight);
  const keyboard = useKeyboardInset(keyboardOffset, freeze);
  // The inset and scroll position as last reported, for the jump button.
  const inset = useRef(0);
  const scrolled = useRef(0);
  const gliding = useSharedValue(false);
  // The composer's height when the content last changed (Android).
  const seenComposer = useRef<number | undefined>(undefined);
  const isNearLatest = useSharedValue(startsAtLatest);

  /**
   * Where the newest message is: the list's inset worked out as
   * `KeyboardChatScrollView` does, on the UI thread, since its report
   * reaches JavaScript a frame or two late.
   */
  function bottom() {
    "worklet";
    if (!IOS) return 0;
    return -Math.max(blankSpace?.get() ?? 0, keyboard.get() + composer.get());
  }

  function nearLatest() {
    const bottom = IOS ? -inset.current : 0;
    isNearLatest.set(scrolled.current - bottom < NEAR_LATEST);
  }

  function glide() {
    "worklet";
    if (gliding.get()) return;
    gliding.set(true);
    // When it started, and the last frame it moved on.
    const run = { last: -1, start: -1 };
    function step(time: number) {
      if (!gliding.get()) return;
      if (run.start === -1) run.start = time;
      const dt = run.last === -1 ? 16 : Math.max(0, time - run.last);
      run.last = time;
      const to = bottom();
      const left = offset.get() - to;
      // On until the room is the composer's too (see `useComposerRoom`).
      const there = Math.abs(left) <= GLIDE_DONE && settled();
      if (there || time - run.start > GLIDE_MAX_MS) {
        if (left !== 0) scrollTo(scrollRef, 0, to, false);
        gliding.set(false);
        return;
      }
      scrollTo(scrollRef, 0, to + left * Math.exp(-dt / GLIDE_MS), false);
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // At the newest message (as it was: the room can already have the new
  // height) as the composer changes height on iOS, the list glides along to
  // stay there: `KeyboardChatScrollView` moves the scroll by each change
  // from where the list was a frame before, so on its own it falls behind a
  // room that changes every frame (see `useComposerRoom`).
  useAnimatedReaction(
    () => (IOS ? live.get() : 0),
    (now, before) => {
      if (before === null || now === before) return;
      const was = -Math.max(blankSpace?.get() ?? 0, keyboard.get() + before);
      if (offset.get() - was < NEAR_LATEST) glide();
    },
  );

  return {
    /** For the list's scroll view, which the glide moves. */
    scrollRef,
    /** The composer's room on iOS, the list's `extraContentPadding`. */
    composer,
    /** Counts the rows' moves as they start (see `Growth`). */
    moving,
    /**
     * The room for the keyboard and composer under the newest row, on iOS
     * (see `Blank`'s `floor`). Android draws its insets in (see above).
     */
    floor: useDerivedValue(() => (IOS ? keyboard.get() + composer.get() : 0)),
    /** The composer's room on Android, a row under the newest message. */
    composerRow: IOS ? 0 : laidOut,
    isNearLatest,
    /** Glides down to the newest message, as after sending one. */
    scrollToLatest: () => scheduleOnUI(glide),
    /**
     * Puts the list at the newest message as it opens, then calls `done`:
     * it starts at offset 0, which on iOS leaves the newest message under
     * the insets (see `openAt`).
     */
    toLatest: (done: () => void) => {
      scheduleOnUI(() => {
        "worklet";
        openAt({ done, offset, scrollRef, to: bottom });
      });
    },
    onInsetChange: (top: number) => {
      inset.current = top;
      // In a thread, its room under the replies shrinks as they come in,
      // and the list scrolls with it: the scroll can be reported before
      // the inset it went with, which showed the jump button at the bottom.
      nearLatest();
    },
    scrollHandlers: {
      // Your own drag takes over from a glide.
      onScrollBeginDrag: () => {
        gliding.set(false);
      },
    },
    /**
     * The list's content changed. On Android, a composer that changed
     * height (a reply bar, another line, an attachment) changed the row
     * under the newest message, and the anchor kept the rows where they
     * were: at the bottom, the list glides down to show what it covers.
     * The anchor's move up has already happened, so how far up the list
     * was is `offset` less the change.
     */
    onContentChange: () => {
      if (IOS) return;
      const seen = seenComposer.current;
      seenComposer.current = laidOut;
      if (seen === undefined || seen === laidOut) return;
      if (offset.get() - (laidOut - seen) > NEAR_LATEST) return;
      scheduleOnUI(glide);
    },
    onScroll: (y: number) => {
      scrolled.current = y;
      nearLatest();
    },
  };
}

/**
 * Scrolls the list to `to` as it opens, again each frame until it's there,
 * then calls `done`. The list can lay out before `KeyboardChatScrollView`
 * has put its insets on the scroll view, and a scroll can't go past the
 * inset the view has yet: a single scroll then stayed at 0, with the
 * newest message under the composer.
 */
function openAt({
  scrollRef,
  offset,
  to,
  done,
}: {
  scrollRef: AnimatedRef<Animated.ScrollView>;
  /** Where the list is, as its scroll events report it. */
  offset: SharedValue<number>;
  to: () => number;
  done: () => void;
}) {
  "worklet";
  let tries = 0;
  function step() {
    const target = to();
    if (Math.abs(offset.get() - target) <= GLIDE_DONE || tries >= OPEN_TRIES) {
      scheduleOnRN(done);
      return;
    }
    tries += 1;
    scrollTo(scrollRef, 0, target, false);
    requestAnimationFrame(step);
  }
  step();
}

/**
 * How much the keyboard lifts the list, as `KeyboardChatScrollView` works
 * it out on iOS: its height less `offset`, set where it's going as it
 * starts to move.
 */
function useKeyboardInset(offset: number, freeze: SharedValue<boolean>) {
  const inset = useSharedValue(0);
  function update(height: number) {
    "worklet";
    if (freeze.get()) return;
    inset.set(Math.max(0, height - offset));
  }
  useKeyboardHandler(
    {
      onStart: (event) => {
        "worklet";
        update(event.height);
      },
      onEnd: (event) => {
        "worklet";
        update(event.height);
      },
    },
    [offset],
  );
  return inset;
}

/**
 * The scroll anchor: the first row on screen, from the newest row up,
 * stays where it is when rows are added or grow below it. (The list skips
 * its header, the gap above the composer, on its own, so index 0 is the
 * newest row, who's typing, and a new message added right above it opens
 * above the anchor.)
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
  listRef: RefObject<FlatList<ListRow> | null>;
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
  toLatest,
  onReady,
  onLoadNewer,
  onLoadOlder,
}: {
  listRef: RefObject<FlatList<ListRow> | null>;
  anchorIndex: number;
  /** Puts the list at the newest message, then calls back (see `useLatest`). */
  toLatest: (done: () => void) => void;
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
        toLatest(place);
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

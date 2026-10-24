import type { ComponentProps, Ref, RefObject } from "react";
import type { AnimatedRef, SharedValue } from "react-native-reanimated";
import { useImperativeHandle, useRef, useState } from "react";
import { FlatList, View } from "react-native";
import { KeyboardChatScrollView } from "react-native-keyboard-controller";
import Animated, {
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import type { BlankSpace } from "./blank-space";
import type { ThreadHead } from "./build-rows";
import type { ComposerHeight } from "./composer-height";
import type { LeavingRows } from "./leave-rows";
import type { Latest } from "./list-position";
import type { ToggleReaction, ViewReactions } from "./message-actions";
import type { ProfileOf } from "./message-row";
import type { MemberNotice, Message, MessageEdits } from "./types";
import type { ListRow } from "./typing-row";
import type { MessageLayout } from "~/features/preferences/store";
import { useBlankSpace } from "./blank-space";
import { newestFirst } from "./build-rows";
import { useDevFling } from "./dev-fling";
import { GrowthProvider } from "./grow";
import { JumpToLatest } from "./jump-to-latest";
import { useLeavingRows } from "./leave-rows";
import { ANCHOR, useLatest } from "./list-position";
import { useListRows } from "./list-rows";
import { useMenuKeyboard } from "./menu-keyboard";
import { MessageActionsProvider } from "./message-actions";
import { Row } from "./message-row";
import { RevealTimes } from "./reveal";
import { headerHeight } from "./row-header";
import { useTypingDrop } from "./typing-drop";
import { TypingRow } from "./typing-indicator";

/**
 * The list's scroll view, which `useLatest` also scrolls through
 * `scrollRef`, alongside the list's own ref.
 */
function ChatScrollView({
  ref,
  scrollRef,
  ...props
}: ComponentProps<typeof KeyboardChatScrollView> & {
  ref?: Ref<Animated.ScrollView>;
  scrollRef: AnimatedRef<Animated.ScrollView>;
}) {
  // Benchmarks' constant-speed fling (dev tools only).
  const sizes = useDevFling(scrollRef, props);
  return (
    <KeyboardChatScrollView
      {...props}
      {...sizes}
      ref={(node: Animated.ScrollView | null) => {
        scrollRef(node);
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
    />
  );
}

/** What the conversation screen can ask of its list. */
export interface MessageListHandle {
  /** Scrolls down to the newest message, as after sending one. */
  scrollToLatest: () => void;
}

export interface RowsProps {
  listRef: RefObject<FlatList<ListRow> | null>;
  /** The rows, with deleted ones leaving (see `useLeavingRows`). */
  leaving: LeavingRows;
  self: string;
  layout: MessageLayout;
  profileOf: ProfileOf;
  showAuthors: boolean;
  anchorId?: string;
  hasNewer: boolean;
  onLoadOlder: () => void;
  onLoadNewer: () => void;
  /** Space below the composer that the keyboard covers when it opens. */
  bottomInset: number;
  topInset: number;
  /** Height of the composer floating over the bottom of the list. */
  composerHeight: ComposerHeight;
  /** Who else is typing here, in the order they started. */
  typists: readonly string[];
  latest: Latest;
  /** Freezes keyboard handling (see useMenuKeyboard). */
  freeze: SharedValue<boolean>;
  /** The list is laid out at its starting place. */
  onReady: () => void;
  /** A thread's room under its replies (see `useBlankSpace`). */
  blank: BlankSpace;
  /**
   * The fade-in has finished: until then the list renders only what's on
   * screen, so nothing mounts while it fades.
   */
  shown: boolean;
}

/** The gap between who's typing (the newest row) and the composer. */
const COMPOSER_GAP = 8;
/** How many screens of rows stay mounted, centered on the screen. */
const WINDOW_SCREENS = 11;
/** How long the conversation takes to fade in. */
const FADE_MS = 220;

/**
 * The messages, in a list that's inverted: it lays out from the newest
 * message up, so it opens at the bottom without scrolling there, and older
 * pages load past the top without moving anything on screen, since rows
 * are laid out in order and never placed at estimated spots first. At the
 * bottom it stays there as messages arrive; scrolled up, what you're
 * reading stays still (see `useLatest`).
 */
function Rows({
  listRef,
  leaving,
  self,
  layout,
  profileOf,
  showAuthors,
  anchorId,
  bottomInset,
  topInset,
  typists,
  latest,
  freeze,
  shown,
  blank,
  ...pages
}: RowsProps) {
  // Under the header, from the top of the screen.
  const top = useSafeAreaInsets().top + topInset;
  const { anchorIndex, listRows, placement, typing } = useListRows({
    ...pages,
    anchorId,
    layout,
    listRef,
    rows: leaving.rows,
    toLatest: latest.toLatest,
    typists,
  });
  return (
    <FlatList
      ref={listRef}
      inverted
      data={listRows}
      keyExtractor={(row) => row.key}
      renderItem={({ item }) =>
        item.type === "typing" ? (
          <TypingRow
            typists={typists}
            typing={typing}
            layout={layout}
            profileOf={profileOf}
            showFaces={showAuthors}
          />
        ) : (
          <Row
            row={item}
            self={self}
            layout={layout}
            profileOf={profileOf}
            showAuthors={showAuthors}
            highlighted={item.key === anchorId}
            arriving={typing.arriving(item)}
            becoming={typing.becomingOf(item.key)}
            leaving={leaving.leavingOf(item.key)}
            onFaded={leaving.faded}
            onClosed={leaving.gone}
          />
        )
      }
      renderScrollComponent={(props) => (
        <ChatScrollView
          {...props}
          scrollRef={latest.scrollRef}
          inverted
          offset={bottomInset}
          freeze={freeze}
          blankSpace={blank.blankSpace}
          // Room for the composer floating over the bottom on iOS; on
          // Android it's the list's header (see useLatest).
          extraContentPadding={latest.composer}
          onContentInsetChange={(insets) => latest.onInsetChange(insets.top)}
        />
      )}
      // Enough to fill the screen at once, and to reach the message it
      // opens on, so that one can be scrolled to before it shows. A page
      // that loads renders all at once, so the list grows (and the scroll
      // bar moves) once per page, not once per batch.
      initialNumToRender={Math.max(20, anchorIndex + 15)}
      maxToRenderPerBatch={8}
      // Just the screen until it has faded in: mounting rows takes the UI
      // thread, and a frame spent on it shows as a hitch in the fade. Then
      // five screens either way, filled in small batches.
      windowSize={shown ? WINDOW_SCREENS : 1}
      // Rows added or growing below what's on screen leave it be: a new
      // message opens in place (see useLatest). Off until it has faded in,
      // so it opens at the bottom whatever arrives meanwhile.
      maintainVisibleContentPosition={shown ? ANCHOR : undefined}
      // Inverted: the list's end is the oldest message, at the top. Older
      // ones load three screens early, so a fast scroll rarely reaches
      // the top before they're there.
      onEndReached={placement.loadOlder}
      onEndReachedThreshold={3}
      onStartReached={placement.loadNewer}
      onStartReachedThreshold={3}
      onScroll={(event) => latest.onScroll(event.nativeEvent.contentOffset.y)}
      {...latest.scrollHandlers}
      scrollEventThrottle={16}
      onContentSizeChange={(_, height) => {
        blank.onContentHeight(height);
        latest.onContentChange();
        placement.onLaidOut();
      }}
      onScrollToIndexFailed={placement.onMissed}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="never"
      // A thread starts at the top, under its original (see
      // `useBlankSpace`).
      onLayout={(event) => blank.onListHeight(event.nativeEvent.layout.height)}
      // A gap under who's typing, above the composer (its inset on iOS,
      // part of this row on Android), and room above the oldest for the
      // header: the messages scroll under both.
      // Inverted, the list's header is at the bottom, its footer at the top.
      ListHeaderComponent={
        <View style={{ height: COMPOSER_GAP + latest.composerRow }} />
      }
      ListFooterComponent={<View style={{ height: top + 8 }} />}
      scrollIndicatorInsets={{ bottom: top }}
      style={{ flex: 1 }}
    />
  );
}

export type MessageListProps = Omit<
  RowsProps,
  "blank" | "freeze" | "latest" | "leaving" | "listRef" | "onReady" | "shown"
> & {
  messages: readonly Message[];
  /** A group's joins and leaves, shown between its messages. */
  notices?: readonly MemberNotice[];
  /** Set in a thread, whose original heads the list. */
  thread?: ThreadHead;
  ref?: Ref<MessageListHandle>;
  onJumpToLatest: () => void;
  onToggleReaction: ToggleReaction;
  /** Opens the sheet of who reacted to a part, on one emoji if given. */
  onViewReactions: ViewReactions;
  /** A tap on a message opens its thread; absent in a thread. */
  onOpenThread?: (message: Message) => void;
  /** The menu's Reply; absent in a thread. */
  onReply?: (message: Message) => void;
  /** The menu's Edit and Delete, on your own messages (`useEditing`). */
  editing?: MessageEdits;
};

/**
 * The conversation, newest at the bottom, with its long-press menu, drag
 * to see times, and a button back down to the latest message. Opens on
 * `anchorId` when given.
 */
export function MessageList({
  ref,
  onJumpToLatest,
  onToggleReaction,
  onViewReactions,
  onOpenThread,
  onReply,
  editing,
  messages,
  notices,
  thread,
  ...props
}: MessageListProps) {
  const listRef = useRef<FlatList<ListRow>>(null);
  const frame = useAnimatedRef<View>();
  // Covered until laid out at its starting place, then faded in. A
  // page-colored cover fades away rather than the list fading in: glass
  // created under a fully transparent parent never draws.
  const loaded = useSharedValue(0);
  const cover = useAnimatedStyle(() => ({ opacity: 1 - loaded.value }));
  const [shown, setShown] = useState(false);
  const keyboard = useMenuKeyboard();
  const blank = useBlankSpace(thread !== undefined, shown);
  const latest = useLatest({
    blankSpace: blank.blankSpace,
    composerHeight: props.composerHeight,
    freeze: keyboard.freeze,
    keyboardOffset: props.bottomInset,
    startsAtLatest: props.anchorId === undefined,
  });
  const typingDrop = useTypingDrop({
    blankSpace: blank.blankSpace,
    composer: latest.composer,
    keyboardOffset: props.bottomInset,
  });
  const { isNearLatest, scrollToLatest } = latest;
  // Read out first: the worklet must not capture `props` (messages hold
  // Dates, which worklets can't copy).
  const { hasNewer } = props;
  const showJump = useDerivedValue(() => hasNewer || !isNearLatest.value);
  const leaving = useLeavingRows(
    messages,
    (shown) => newestFirst(shown, props.layout, thread, notices),
    (row) => headerHeight(row, props),
  );

  useImperativeHandle(ref, () => ({ scrollToLatest }));

  return (
    <MessageActionsProvider
      onToggleReaction={onToggleReaction}
      onViewReactions={onViewReactions}
      onOpenThread={onOpenThread}
      onReply={onReply}
      editing={editing}
      // The menu is a modal, which takes the keyboard down on iOS and
      // reports it again on Android; the list stays still through both.
      menuKeyboard={keyboard}
    >
      <RevealTimes>
        <View ref={frame} style={{ flex: 1 }}>
          <GrowthProvider
            list={frame}
            // The rows move with a thread's blank space as it changes, so
            // rows that change size update it at once (see `lift`).
            blank={blank.sizes && { ...blank.sizes, floor: latest.floor }}
            typingDrop={typingDrop}
            moving={latest.moving}
          >
            <Rows
              {...props}
              leaving={leaving}
              blank={blank}
              listRef={listRef}
              latest={latest}
              freeze={keyboard.freeze}
              shown={shown}
              onReady={() => {
                // Two frames later, once the first scroll (to the message it
                // opened on) has drawn and the rows' mounting is done, so it
                // can't hitch the fade's first frame.
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    loaded.set(
                      withTiming(1, { duration: FADE_MS }, (done) => {
                        if (done === true) scheduleOnRN(setShown, true);
                      }),
                    );
                  }),
                );
              }}
            />
          </GrowthProvider>
        </View>
      </RevealTimes>
      <Animated.View
        pointerEvents="none"
        className="bg-background absolute inset-0"
        style={cover}
      />
      <JumpToLatest
        visible={showJump}
        above={props.composerHeight.live}
        onPress={() => {
          if (hasNewer) onJumpToLatest();
          else scrollToLatest();
        }}
      />
    </MessageActionsProvider>
  );
}

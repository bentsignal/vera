import type { RefObject } from "react";
import type { SharedValue } from "react-native-reanimated";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MessageListProps } from "./list-props";
import type { Lift, MessageListViewMethods } from "./native";
import type { TypingHold } from "./typing-hold";
import type { SendCommitStore } from "~/features/conversation/send-commit";
import type { Message } from "~/features/conversation/types";
import { newestFirst } from "~/features/conversation/build-rows";
import { JumpToLatest } from "~/features/conversation/jump-to-latest";
import {
  MessageActionsProvider,
  useMessageActions,
} from "~/features/conversation/message-actions";
import { useToday } from "~/lib/use-today";
import { COMPOSER_GAP } from "./composer-binding";
import { useDevNativeFling } from "./dev-native-fling";
import { nativeRows } from "./map-rows";
import { useMenuKeyboardHold } from "./menu-keyboard-hold";
import {
  CONTRACT_VERSION,
  MessageListView,
  nativeSupport,
  V1_BLOCK_TYPES,
  V1_ROW_KINDS,
} from "./native";
import { useComposerInset } from "./send-inset";
import { BEHAVIOR, useNativeTheme } from "./theme";
import {
  dropLeaving,
  dueBy,
  holdLeftMs,
  holdTypists,
  NO_TYPING,
  recentOf,
  sameHold,
  timerChanges,
} from "./typing-hold";
import { useAnchorPlacement } from "./use-anchor-placement";
import { useListEvents } from "./use-list-events";

/** Room above the oldest row, under the header. */
const HEADER_GAP = 8;

type RowsProps = Omit<
  MessageListProps,
  "editing" | "onReply" | "onViewReactions" | "ref"
> & {
  handle: MessageListProps["ref"];
  /** The menu has the keyboard held where it was (`useMenuKeyboardHold`). */
  keyboardFrozen: boolean;
  /** The menu's freeze, as it happens, for the jump button. */
  keyboardFreeze: SharedValue<boolean>;
  /** A message was held: freezes the keyboard before the menu opens. */
  onHold: () => void;
};

/**
 * Who the typing row shows: who's typing, and for a moment anyone who
 * stopped before their message arrived (see `holdTypists`).
 */
function useHeldTypists(
  typists: readonly string[],
  recent: ReturnType<typeof recentOf>,
) {
  const [hold, setHold] = useState<TypingHold>(NO_TYPING);
  const next = holdTypists(hold, typists, recent);
  if (!sameHold(hold, next)) setHold(next);
  /** When each leaving person stopped (see `timerChanges`). */
  const stopped = useRef(new Map<string, number>());
  const leaving = next.leaving.join(" ");
  // eslint-disable-next-line no-restricted-syntax -- Someone who stopped typing and sent nothing goes once their own time is up, which no data change marks.
  useEffect(() => {
    const since = stopped.current;
    const now = Date.now();
    const changes = timerChanges(
      since.keys(),
      leaving === "" ? [] : leaving.split(" "),
    );
    for (const address of changes.stop) since.delete(address);
    for (const address of changes.start) since.set(address, now);
    if (since.size === 0) return undefined;
    // The soonest one's time, from when they stopped, so someone else
    // stopping later doesn't keep them longer. Their going sets the next.
    const soonest = Math.min(...since.values());
    const timer = setTimeout(
      () => {
        setHold((current) => dropLeaving(current, dueBy(since, soonest)));
      },
      holdLeftMs(soonest, now),
    );
    return () => clearTimeout(timer);
  }, [leaving]);
  return next.shown;
}

/**
 * The list's rows (see `nativeRows`), and the message each message row
 * shows, by its ID.
 */
function useRows({
  messages,
  notices,
  thread,
  typists,
  ...context
}: Pick<
  RowsProps,
  | "anchorId"
  | "layout"
  | "members"
  | "messages"
  | "notices"
  | "profileOf"
  | "self"
  | "showAuthors"
  | "thread"
  | "typists"
>) {
  // Only messages that arrive while it's open animate in.
  const [openedAt] = useState(Date.now);
  // Re-labels the rows ("Today", "Yesterday · 9:14 PM") at midnight.
  const now = useToday();
  const built = newestFirst(messages, context.layout, thread, notices);
  const byId = new Map<string, Message>();
  for (const row of built) {
    if (row.type === "message") byId.set(row.key, row.message);
  }
  const typing = useHeldTypists(typists, recentOf(built));
  const rows = nativeRows(built, typing, {
    ...context,
    now,
    openedAt,
    support: nativeSupport ?? {
      blockTypes: V1_BLOCK_TYPES,
      rowKinds: V1_ROW_KINDS,
    },
  });
  return { messageOf: (rowId: string) => byId.get(rowId), rows };
}

function useLift(view: RefObject<MessageListViewMethods | null>) {
  const [lift, setLift] = useState<Lift>();
  function change(next: Lift | undefined) {
    setLift(next);
    if (
      next === undefined &&
      nativeSupport?.features?.includes("liftHandoff") === true
    ) {
      return view.current?.landLift?.();
    }
  }
  return { change, lift };
}

/** Manual jumps remain smooth; a local send records its deferred request. */
function useNativeHandle(
  handle: RowsProps["handle"],
  view: RefObject<MessageListViewMethods | null>,
  commit: SendCommitStore,
) {
  useDevNativeFling(view);
  function scrollToLatest() {
    if (commit.requestLatest()) return;
    void view.current?.scrollToLatest(true);
  }
  useImperativeHandle(handle, () => ({ scrollToLatest }));
  return scrollToLatest;
}

function useNativeActions(commit: SendCommitStore, onHold: () => void) {
  const { open, viewReactions } = useMessageActions();
  return {
    viewReactions,
    open: (target: Parameters<typeof open>[0]) => {
      commit.interruptLatest();
      onHold();
      open(target);
    },
  };
}

function NativeRows({
  handle,
  onJumpToLatest,
  onToggleReaction,
  onOpenThread,
  hasNewer,
  onLoadOlder,
  onLoadNewer,
  topInset,
  composerHeight,
  bottomInset,
  keyboardFrozen,
  keyboardFreeze,
  onHold,
  ...shown
}: RowsProps) {
  const { view, attach, ...place } = useAnchorPlacement(shown, hasNewer);
  const scrollToLatest = useNativeHandle(
    handle,
    view,
    composerHeight.sendCommit,
  );
  const { open, viewReactions } = useNativeActions(
    composerHeight.sendCommit,
    onHold,
  );
  const { layout, self } = shown;
  const theme = useNativeTheme(layout);
  const safeTop = useSafeAreaInsets().top;
  // A send's message waits for the composer's new height (`useComposerInset`).
  const composer = useComposerInset(composerHeight, shown.messages, {
    frozen: keyboardFrozen,
    view,
    freeze: keyboardFreeze,
  });
  const { messageOf, rows } = useRows({
    ...shown,
    messages: composer.messages,
  });
  const { lift, change: changeLift } = useLift(view);

  const onEvent = useListEvents({
    menu: { layout, lift: changeLift, self },
    messageOf,
    // Frozen in the render the menu opens in, before it takes the keyboard.
    openMenu: open,
    openThread: onOpenThread,
    pages: {
      ...place,
      onLoadNewer,
      onLoadOlder,
    },
    toggleReaction: onToggleReaction,
    viewReactions,
  });

  if (MessageListView === null) return null;
  return (
    <>
      <View style={{ flex: 1 }}>
        <MessageListView
          ref={attach}
          style={{ flex: 1 }}
          contractVersion={CONTRACT_VERSION}
          rows={rows}
          theme={theme}
          behavior={BEHAVIOR}
          insets={{
            bottom: composer.inset + COMPOSER_GAP,
            keyboardOverlap: bottomInset,
            top: safeTop + topInset + HEADER_GAP,
          }}
          composer={composer.binding}
          keyboard
          keyboardFrozen={keyboardFrozen}
          alignTop={shown.thread !== undefined}
          lift={lift}
          initialRowId={shown.anchorId}
          onEvent={onEvent}
        />
      </View>
      <Animated.View
        pointerEvents="none"
        className="bg-background absolute inset-0"
        style={place.cover}
      />
      <JumpToLatest
        visible={place.showJump}
        above={composerHeight.live}
        // Native moves the rows with the keyboard; nothing moves this.
        keyboard={{ bottomInset, frozen: keyboardFreeze }}
        onPress={() => {
          if (hasNewer) onJumpToLatest();
          else scrollToLatest();
        }}
      />
    </>
  );
}

/**
 * A conversation's or thread's messages, newest at the bottom, in the
 * native message list (see .plans/native-message-list.md), with the glass
 * menu, the reactions sheet, and a button back down to the latest message.
 * Opens on `anchorId` when given.
 */
export function NativeMessageList({
  ref,
  onViewReactions,
  onReply,
  editing,
  ...props
}: MessageListProps) {
  const keyboard = useMenuKeyboardHold();
  return (
    <MessageActionsProvider
      onToggleReaction={props.onToggleReaction}
      onViewReactions={onViewReactions}
      onOpenThread={props.onOpenThread}
      onReply={onReply}
      editing={editing}
      menuKeyboard={keyboard.menuKeyboard}
    >
      <NativeRows
        {...props}
        handle={ref}
        keyboardFrozen={keyboard.frozen}
        keyboardFreeze={keyboard.freeze}
        onHold={keyboard.hold}
      />
    </MessageActionsProvider>
  );
}

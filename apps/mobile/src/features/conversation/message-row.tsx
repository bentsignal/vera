import type { ReactNode } from "react";
// eslint-disable-next-line no-restricted-imports -- `memo` for list rows, see `Row`.
import { memo } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import type { Becoming } from "./arrive";
import type { MessageRow } from "./build-rows";
import type { RowLeaving } from "./leave-rows";
import type { ReplyCard, ThreadReplies } from "./reply-card";
import type { Message } from "./types";
import type { MessageLayout } from "~/features/preferences/store";
import { Arrive } from "./arrive";
import { orderOfRow } from "./build-rows";
import { DaySeparator, TimeHeader } from "./day-separator";
import { useRowLift } from "./grow";
import { Leave, useLeaveState } from "./leave";
import { MemberNotice } from "./member-notice";
import { MessageBubble } from "./message-bubble";
import { MessageStacked } from "./message-stacked";
import { RepliesDivider } from "./replies-divider";
import { MessageRowTarget } from "./row-target";

export type ProfileOf = (address: string) => {
  avatarUrl: string | null;
  displayName: string;
};

/** Fades a tint behind the message a conversation opened on. */
function Highlight({ children }: { children: ReactNode }) {
  const tint = useSharedValue(1);
  useAnimatedReaction(
    () => true,
    (_, previous) => {
      if (previous === null)
        tint.set(withDelay(800, withTiming(0, { duration: 1600 })));
    },
  );
  // The tint's opacity fades, not its color: a color string built from a
  // tiny number ("5e-16") is invalid, and Android's Reanimated throws on it.
  const style = useAnimatedStyle(() => ({ opacity: 0.18 * tint.value }));
  return (
    <View>
      <Animated.View
        pointerEvents="none"
        className="absolute inset-0"
        style={[{ backgroundColor: "rgb(124, 124, 255)" }, style]}
      />
      {children}
    </View>
  );
}

interface RowProps {
  row: MessageRow;
  self: string;
  layout: MessageLayout;
  profileOf: ProfileOf;
  showAuthors: boolean;
}

/**
 * One row of the list. Its props are passed on one by one, not spread:
 * a spread makes a new object each render, so the React Compiler couldn't
 * tell the row is unchanged and every row on screen would redraw whenever
 * the list did.
 *
 * Memoized by hand: the list is inverted, so every new message is
 * inserted first and moves every other row's index, and FlatList redraws
 * each cell whose index moved by calling `renderItem` again. That call
 * happens inside FlatList, where the React Compiler can't skip it, so
 * without `memo` every mounted row redrew for every message (50 or more
 * rows, many times a second in a busy group).
 */
export const Row = memo(function Row({
  row,
  self,
  layout,
  profileOf,
  showAuthors,
  highlighted,
  arriving,
  becoming,
  leaving,
  onFaded,
  onClosed,
}: RowProps & {
  highlighted: boolean;
  arriving: boolean;
  /** It takes the typing indicator's place (see `Arrive`). */
  becoming: Becoming | undefined;
  /** Set while the row leaves, deleted (see `Leave`). */
  leaving: RowLeaving | undefined;
  onFaded: (batch: number) => void;
  onClosed: (batch: number) => void;
}) {
  const order = orderOfRow(row);
  return (
    <RowLift
      order={order}
      // Stacked rows' reactions open below the message, so the row itself
      // moves up as they do.
      withOwn={layout === "stacked"}
      leaving={leaving}
      onFaded={onFaded}
      onClosed={onClosed}
    >
      <RowShell
        rowKey={row.key}
        order={order}
        highlighted={highlighted}
        arriving={arriving || becoming !== undefined}
        becoming={becoming}
      >
        <RowContent
          row={row}
          self={self}
          layout={layout}
          profileOf={profileOf}
          showAuthors={showAuthors}
        />
      </RowShell>
    </RowLift>
  );
});

/**
 * Moves the row with the rows above a row that grows (see `useRowLift`),
 * and fades and closes it when it leaves (see `Leave`).
 */
function RowLift({
  order,
  withOwn,
  leaving,
  onFaded,
  onClosed,
  children,
}: {
  order: number;
  withOwn: boolean;
  leaving: RowLeaving | undefined;
  onFaded: (batch: number) => void;
  onClosed: (batch: number) => void;
  children: ReactNode;
}) {
  const measured = useAnimatedRef<View>();
  const leave = useLeaveState();
  const lift = useRowLift(order, withOwn, leave, leaving !== undefined);
  return (
    <Animated.View
      ref={measured}
      // Fading out as one (see `SendingFade`).
      needsOffscreenAlphaCompositing={leaving !== undefined}
      style={lift}
    >
      {leaving !== undefined && (
        <Leave
          leaving={leaving}
          order={order}
          measured={measured}
          state={leave}
          onFaded={onFaded}
          onClosed={onClosed}
        />
      )}
      {children}
    </Animated.View>
  );
}

/**
 * What wraps a row: the tint behind the message the conversation opened on,
 * and the arrival of a row that came in while it's open.
 */
function RowShell({
  rowKey,
  order,
  highlighted,
  arriving,
  becoming,
  children,
}: {
  rowKey: string;
  order: number;
  highlighted: boolean;
  arriving: boolean;
  becoming: Becoming | undefined;
  children: ReactNode;
}) {
  if (arriving) {
    return (
      <Arrive rowKey={rowKey} order={order} becoming={becoming}>
        <RowShell
          rowKey={rowKey}
          order={order}
          highlighted={highlighted}
          arriving={false}
          becoming={undefined}
        >
          {children}
        </RowShell>
      </Arrive>
    );
  }
  return highlighted ? <Highlight>{children}</Highlight> : children;
}

function personOf(address: string, profileOf: ProfileOf) {
  return { address, ...profileOf(address) };
}

/** What a reply shows around it in the conversation. */
function replyCard(message: Message, profileOf: ProfileOf) {
  if (message.quote === undefined) return undefined;
  const repliers = message.thread?.repliers ?? [];
  return {
    more: (message.thread?.replyCount ?? 1) - 1,
    quote: message.quote,
    quoteAuthor: personOf(message.quote.authorId, profileOf),
    repliers: repliers.map((address) => personOf(address, profileOf)),
  } satisfies ReplyCard;
}

/** What a thread's original shows under it in the conversation. */
function threadReplies(message: Message, profileOf: ProfileOf) {
  if (message.threadId !== undefined || message.thread === undefined) {
    return undefined;
  }
  return {
    count: message.thread.replyCount,
    repliers: message.thread.repliers.map((address) =>
      personOf(address, profileOf),
    ),
  } satisfies ThreadReplies;
}

function RowContent({ row, self, layout, profileOf, showAuthors }: RowProps) {
  const stacked = layout === "stacked";
  if (row.type === "day") {
    return (
      <DaySeparator
        date={row.date}
        stacked={stacked}
        opensThread={row.opensThread}
      />
    );
  }
  if (row.type === "time") {
    return (
      <TimeHeader
        date={row.date}
        stacked={stacked}
        opensThread={row.opensThread}
        named={showAuthors && row.author !== undefined && row.author !== self}
      />
    );
  }
  if (row.type === "replies") {
    return <RepliesDivider count={row.count} />;
  }
  if (row.type === "notice") {
    return (
      <MemberNotice
        notice={row.notice}
        stacked={stacked}
        followsNotice={row.followsNotice}
      />
    );
  }
  const { message } = row;
  const card = replyCard(message, profileOf);
  const replies = threadReplies(message, profileOf);
  return (
    <MessageRowTarget message={message}>
      {stacked ? (
        <MessageStacked
          message={message}
          author={profileOf(message.authorId)}
          startsGroup={row.startsGroup}
          card={card}
          replies={replies}
        />
      ) : (
        <MessageBubble
          message={message}
          isOwn={message.authorId === self}
          author={showAuthors ? profileOf(message.authorId) : undefined}
          startsGroup={row.startsGroup}
          endsGroup={row.endsGroup}
          card={card}
          replies={replies}
        />
      )}
    </MessageRowTarget>
  );
}

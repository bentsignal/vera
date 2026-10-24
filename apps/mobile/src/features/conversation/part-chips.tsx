import type { ComponentProps, ReactNode } from "react";
import type { View as NativeView } from "react-native";
import type { AnimatedRef } from "react-native-reanimated";
import { createContext, use, useState } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedReaction,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type {
  ReactionPart,
  ReactionSummary,
} from "~/features/messaging/reactions";
import { reactionsOn } from "~/features/messaging/reactions";
import { impact, selectionTick } from "~/lib/native-extras";
import { GrowingSpace, usePieceLift } from "./grow";
import { useMessageActions } from "./message-actions";
import { ChipRow } from "./reaction-chips";

/** How a part's reactions make room for themselves (see `GrowingSpace`). */
export interface Room {
  /** The row's order (see `rowOrder`). */
  order: number;
  /** Where the space is in the row (see `Place`). */
  place: number;
  /** Whether they arrived while the conversation was on screen. */
  animate: boolean;
  /** The message, measured to tell whether it's on screen. */
  measured: AnimatedRef<NativeView>;
}

/** Stacked rows' chips, under a part or the whole message. */
function Chips({
  open,
  room,
  ...row
}: ComponentProps<typeof ChipRow> & { open: boolean; room: Room }) {
  const [used, setUsed] = useState(open);
  if (open && !used) setUsed(true);
  // Already there when the row appeared: laid out with it.
  if (!room.animate) return open ? <ChipRow {...row} /> : null;
  return used ? <GrowingChips open={open} room={room} {...row} /> : null;
}

/**
 * Chips that arrive while you watch, in space that opens to fit them. The
 * row moves up as it opens (see `useRowLift`), and the chips stay put:
 * they're drawn where they end up, and pop in once the messages have
 * started clearing the space, so they never cover what's below.
 *
 * They mount then rather than fading in with the space: a chip's glass
 * that mounts under a parent with opacity below 1 can stay blank (see
 * `GlassSurface`), as the first reaction on a message did.
 */
function GrowingChips({
  open,
  room,
  ...row
}: ComponentProps<typeof ChipRow> & { open: boolean; room: Room }) {
  const [natural, setNatural] = useState(0);
  // Rises from 0 as the messages clear the space (see `showWithRoom`), and
  // drops to 0 the moment it closes.
  const opened = useSharedValue(0);
  const [roomy, setRoomy] = useState(false);
  useAnimatedReaction(
    () => opened.get() > 0,
    (now, before) => {
      if (now !== before) scheduleOnRN(setRoomy, now);
    },
  );
  const stay = usePieceLift(room.order, room.place, true);
  return (
    <View>
      <GrowingSpace height={open ? natural : 0} opened={opened} {...room} />
      <View
        // The chips' height, from a copy with no glass that's never drawn,
        // laid out on its own as wide as the row so it has its full height
        // whatever the space's.
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="absolute inset-x-0 top-0 opacity-0"
        onLayout={(event) => setNatural(event.nativeEvent.layout.height)}
      >
        {open && <ChipRow ghost {...row} />}
      </View>
      <Animated.View className="absolute inset-x-0 top-0" style={stay}>
        {open && roomy && <ChipRow {...row} />}
      </Animated.View>
    </View>
  );
}

/**
 * A part's chips, which add or take back a reaction on it when tapped and
 * show who reacted with it when held.
 */
export function PartChips({
  messageId,
  part,
  reactions,
  align,
  room,
}: {
  messageId: string;
  part: ReactionPart;
  reactions: readonly ReactionSummary[];
  align: "end" | "start";
  room: Room;
}) {
  const { toggleReaction, viewReactions } = useMessageActions();
  return (
    <Chips
      open={reactions.length > 0}
      room={room}
      reactions={reactions}
      align={align}
      onToggle={(emoji) => {
        selectionTick();
        toggleReaction(messageId, emoji, part);
      }}
      onHold={(emoji) => {
        impact();
        viewReactions(messageId, part, emoji);
      }}
    />
  );
}

/**
 * A stacked row's reactions in its lifted copy, which its parts draw still
 * under them, as in the list, so the copy lines up with the row.
 */
const StillChipsContext = createContext<{
  readonly reactions: readonly ReactionSummary[];
  readonly chipsAtEnd: ReactionPart | null;
} | null>(null);

/** The lifted copy of a stacked row (see `StillChipsContext`). */
export function StillChips({
  reactions,
  chipsAtEnd,
  children,
}: {
  reactions: readonly ReactionSummary[];
  chipsAtEnd: ReactionPart | null;
  children: ReactNode;
}) {
  return (
    <StillChipsContext value={{ chipsAtEnd, reactions }}>
      {children}
    </StillChipsContext>
  );
}

/** Nothing: the lifted copy's chips only show what's there. */
function still() {
  return undefined;
}

/** A part in a lifted copy, with its chips under it when it has its own. */
export function StillPart({
  part,
  children,
}: {
  part: ReactionPart;
  children: ReactNode;
}) {
  const copy = use(StillChipsContext);
  const reactions = copy === null ? [] : reactionsOn(copy.reactions, part);
  if (copy === null || part === copy.chipsAtEnd || reactions.length === 0) {
    return children;
  }
  return (
    <View className="items-start self-stretch">
      {children}
      <View className="self-stretch">
        <ChipRow
          reactions={reactions}
          align="start"
          onToggle={still}
          onHold={still}
        />
      </View>
    </View>
  );
}

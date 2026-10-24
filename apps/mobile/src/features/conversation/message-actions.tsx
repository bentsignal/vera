import type { ReactNode, RefObject } from "react";
import type { View as NativeView } from "react-native";
import { createContext, use, useRef, useState } from "react";
import { Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import type {
  MenuTarget,
  PreviewShape,
  TargetAlign,
} from "./glass-message-menu";
import type { LiftMode } from "./row-touch";
import type { Message, MessageAttachment, MessageEdits } from "./types";
import type { ReactionPart } from "~/features/messaging/reactions";
import { useAccount } from "~/features/messaging/account";
import { impact } from "~/lib/native-extras";
import { GlassMessageMenu } from "./glass-message-menu";
import { handlersFor } from "./menu-actions";
import { MenuPressContext, reportTouch, usePartTarget } from "./row-touch";

/** Adds or takes back your reaction on a part of a message. */
export type ToggleReaction = (
  messageId: string,
  emoji: string,
  part: ReactionPart,
) => void;

/** Opens who reacted to a part, on the given emoji's tab if there is one. */
export type ViewReactions = (
  messageId: string,
  part: ReactionPart,
  emoji?: string,
) => void;

interface MessageActions {
  readonly open: (target: MenuTarget) => void;
  /**
   * Opens a message's thread (a reply's own). Absent in a thread, where a
   * tap does nothing.
   */
  readonly openThread?: (message: Message) => void;
  readonly toggleReaction: ToggleReaction;
  readonly viewReactions: ViewReactions;
}

const MessageActionsContext = createContext<MessageActions | null>(null);

/** The part lifted into the menu, from when it opens until it's closed. */
const LiftedPartContext = createContext<
  { readonly messageId: string; readonly part: ReactionPart } | undefined
>(undefined);

/** Whether this part of a message is lifted into the menu right now. */
export function useIsLifted(messageId: string, part: ReactionPart) {
  const lifted = use(LiftedPartContext);
  return lifted?.messageId === messageId && lifted.part === part;
}

/** The message lifted into the menu right now, if one is. */
export function useLiftedMessageId() {
  return use(LiftedPartContext)?.messageId;
}

const ReactionPartContext = createContext<ReactionPart>("message");

/**
 * The part of a message around a part's pieces (see `Reactable`), which
 * reactions picked from them go to. Pieces outside every part (link cards
 * under the text) are the message's.
 */
export function ReactionPartProvider({
  part,
  children,
}: {
  part: ReactionPart;
  children: ReactNode;
}) {
  return <ReactionPartContext value={part}>{children}</ReactionPartContext>;
}

export function useMessageActions() {
  const actions = use(MessageActionsContext);
  if (actions === null) {
    throw new Error("Messages must render inside MessageActionsProvider");
  }
  return actions;
}

/**
 * Long-press actions for the messages below: the glass reaction overlay,
 * reaction toggles for the chips, the sheet of who reacted, and in a
 * conversation, replies and threads.
 */
export function MessageActionsProvider({
  onToggleReaction,
  onViewReactions,
  onOpenThread,
  onReply,
  editing,
  menuKeyboard,
  children,
}: {
  onToggleReaction: ToggleReaction;
  onViewReactions: ViewReactions;
  /** A tap on a message opens its thread; absent in a thread. */
  onOpenThread?: (message: Message) => void;
  /** The menu's Reply; absent in a thread. */
  onReply?: (message: Message) => void;
  /** The menu's Edit and Delete, on your own messages. */
  editing?: MessageEdits;
  /** What the keyboard does around the menu (see `useMenuKeyboard`). */
  menuKeyboard?: {
    onOpen: () => void;
    onClosing: () => void;
    onClosed: (backToChat: boolean) => void;
  };
  children: ReactNode;
}) {
  const { address } = useAccount();
  const [target, setTarget] = useState<MenuTarget | null>(null);
  return (
    <MessageActionsContext
      value={{
        open: (next) => {
          menuKeyboard?.onOpen();
          setTarget(next);
        },
        openThread: onOpenThread,
        toggleReaction: onToggleReaction,
        viewReactions: onViewReactions,
      }}
    >
      <LiftedPartContext
        value={
          target === null
            ? undefined
            : { messageId: target.message.id, part: target.part }
        }
      >
        {children}
      </LiftedPartContext>
      {target !== null && (
        <GlassMessageMenu
          target={target}
          onReact={(emoji) =>
            onToggleReaction(target.message.id, emoji, target.part)
          }
          onViewReactions={(emoji) =>
            onViewReactions(target.message.id, target.part, emoji)
          }
          handlers={handlersFor(target.message, {
            editing,
            onReply,
            self: address,
          })}
          onClosing={menuKeyboard?.onClosing}
          onClosed={(backToChat) => {
            setTarget(null);
            menuKeyboard?.onClosed(backToChat);
          }}
        />
      )}
    </MessageActionsContext>
  );
}

/** Press-and-hold squeezes the held element a little, as iOS does. */
const PRESS_SCALE = 0.96;
export const LONG_PRESS_MS = 320;
const RELEASE_SPRING = { damping: 14, stiffness: 320 };

/** The message whose parts (bubble, link cards) open its menu. */
interface MessageTarget {
  readonly message: Message;
  /** Which side the message sits on; the reaction bar lines up with it. */
  readonly align: TargetAlign;
  /** How its text lifts. */
  readonly shape: PreviewShape;
}

const MessageTargetContext = createContext<MessageTarget | null>(null);

/**
 * A message whose parts open its menu on a long press. Each part makes
 * itself a target (`MenuTargetView`, `useMenuTarget`), so holding one lifts
 * just that part.
 */
export function MessageTargetProvider({
  message,
  align,
  shape,
  children,
}: MessageTarget & { children: ReactNode }) {
  return (
    <MessageTargetContext value={{ align, message, shape }}>
      {children}
    </MessageTargetContext>
  );
}

/** What a part of a message lifts into the menu, besides where it sits. */
type LiftedPart = Omit<MenuTarget, "rect">;

/** Lifts `measured` into the menu from where it sits on screen. */
function lift(
  open: (target: MenuTarget) => void,
  measured: RefObject<NativeView | null>,
  part: LiftedPart,
) {
  measured.current?.measureInWindow((x, y, width, height) =>
    open({ ...part, rect: { height, width, x, y } }),
  );
}

/**
 * Lifts a part of a message, `measured` (the part as it sits in the list)
 * with `preview`, a copy of it, and the reactions picked go to the part:
 * for its tapbacks, and for a hold or double tap beside a message of one
 * part.
 */
export function useLiftMessage({
  message,
  align,
  shape,
  part,
  measured,
  preview,
}: MessageTarget & {
  part: ReactionPart;
  measured: RefObject<NativeView | null>;
  preview: ReactNode;
}) {
  const { open } = useMessageActions();
  return (mode: LiftMode) => {
    lift(open, measured, { align, message, mode, part, preview, shape });
  };
}

/**
 * The squeeze while something is held, as iOS does: it shrinks a little
 * toward the hold's length, and springs back as it lifts or is let go. Put
 * `style` on what squeezes.
 */
export function useSqueeze() {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return {
    pressIn: () => {
      scale.set(withTiming(PRESS_SCALE, { duration: LONG_PRESS_MS }));
    },
    release: () => {
      scale.set(withSpring(1, RELEASE_SPRING));
    },
    style,
  };
}

/**
 * Makes one part of a message (its text, an attachment, a link card) open
 * the message's glass overlay on a long press, lifting `preview`, a copy of
 * just this part, from where `measured` sits. So a message with several
 * parts never lifts taller than it needs to; reactions picked there go to
 * the part (see `ReactionPartProvider`). Spread `press` on the Pressable
 * `measured` refers to, and put `style` (the squeeze while held) on the
 * part. `openMenu` opens it as a hold does (a double tap). A hold or
 * double tap beside it in its row can lift it too (see `usePartTarget`).
 * Null outside a message, as in the lifted copy, where the part draws as
 * is.
 */
export function useMenuTarget({
  measured,
  link,
  attachment,
  shape,
  preview,
}: {
  /** The part's Pressable, measured to lift the copy from where it sits. */
  measured: RefObject<NativeView | null>;
  /** The link of a held card, which the menu is then about. */
  link?: string;
  /** A held photo, video, or file, which the menu can save. */
  attachment?: MessageAttachment;
  /** How this part lifts; the message's text shape by default. */
  shape?: PreviewShape;
  preview: ReactNode;
}) {
  const target = use(MessageTargetContext);
  const part = use(ReactionPartContext);
  const { open } = useMessageActions();
  const squeeze = useSqueeze();
  // A message still sending (or that failed) has no menu yet, and a
  // deleted one has none.
  const holdable =
    target !== null &&
    target.message.status === undefined &&
    target.message.deleted !== true;
  function liftPart() {
    if (target === null) return;
    lift(open, measured, {
      align: target.align,
      attachment,
      link,
      message: target.message,
      mode: "actions",
      part,
      preview,
      shape: shape ?? target.shape,
    });
  }
  usePartTarget(
    holdable
      ? {
          lift: liftPart,
          measured,
          pressIn: squeeze.pressIn,
          release: squeeze.release,
        }
      : undefined,
  );
  if (target === null) return null;
  function openMenu() {
    if (!holdable) return;
    impact();
    squeeze.release();
    liftPart();
  }
  return {
    openMenu,
    press: {
      delayLongPress: LONG_PRESS_MS,
      onLongPress: openMenu,
      onPressIn: () => {
        if (holdable) squeeze.pressIn();
      },
      onPressOut: squeeze.release,
    },
    style: squeeze.style,
  };
}

/**
 * A part of a message that opens its menu on a long press, lifted as is.
 * Its taps are its row's (see `MessageRowTarget`): a double tap opens its
 * menu as a hold does, and in a conversation a single tap opens its
 * thread.
 */
export function MenuTargetView({
  shape,
  children,
}: {
  /** How this part lifts; the message's text shape by default. */
  shape?: PreviewShape;
  children: ReactNode;
}) {
  const ref = useRef<NativeView>(null);
  const target = useMenuTarget({ measured: ref, preview: children, shape });
  if (target === null) return children;
  const press = {
    ...target.press,
    onPressIn: () => {
      reportTouch({ openMenu: target.openMenu });
      target.press.onPressIn();
    },
  };
  return (
    <Pressable ref={ref} {...press}>
      <MenuPressContext value={press}>
        <Animated.View style={target.style}>{children}</Animated.View>
      </MenuPressContext>
    </Pressable>
  );
}

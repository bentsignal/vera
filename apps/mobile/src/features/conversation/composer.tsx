import type { Mention } from "@decentralized-convex/messages";
import type { ReactNode, Ref, RefObject } from "react";
import { useImperativeHandle, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, {
  interpolate,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

import type { MentionCandidate } from "./mention-text";
import type { ReplyingTo } from "./reply-bar";
import type {
  AttachmentSource,
  StagedFile,
} from "~/features/messaging/attachments";
import type { PastedImage } from "~/lib/paste-images";
import { GlassSurface } from "~/components/glass-surface";
import { SymbolIcon } from "~/components/symbol-icon";
import { cn } from "~/lib/cn";
import { PASTE_IMAGES_NATIVE_ID, usePastedImages } from "~/lib/paste-images";
import { AttachMenu } from "./attach-menu";
import { readDraft, saveDraftText } from "./drafts";
import { MentionPicker } from "./mention-picker";
import { ReplyBar } from "./reply-bar";
import { StagedAttachments } from "./staged-attachments";
import { useMentions } from "./use-mentions";

const StyledTextInput = withUniwind(TextInput);
/** Every control in the composer shares this height so they line up. */
const CONTROL = 40;
const SEND = 32;
/** How long after a send the keyboard may still apply an autocorrection. */
const AUTOCORRECT_WINDOW_MS = 1000;
/**
 * On iOS the controls sit this far from the screen's sides and, on phones
 * with a home indicator, its bottom, like Messages: low and inside the
 * rounded corners.
 */
const IOS_EDGE = 28;
/**
 * While typing on iOS the controls widen to this, a little, moving with the
 * keyboard so the change is barely noticed.
 */
const IOS_TYPING_EDGE = 16;
const ANDROID_EDGE = 12;
/** The bar's padding above and below the controls. */
const PADDING = 8;
/**
 * The field's padding around its text. On iOS, UIKit lays a line out
 * taller than React Native measures it (21pt against 20.33), so a field
 * with text in it was a little too short for its text and could scroll.
 * Low on the screen, iOS also pads a scrolling field's bottom out of the
 * home indicator's inset, and with the keyboard down the text could sit
 * about 6pt high until the keyboard came back. A whole-point line height makes
 * both measure the same, so the text always fits. iOS puts the extra line
 * height above the text, so a point moves from the top to the bottom to
 * keep it centered. The field stays `CONTROL` tall.
 */
const TEXT_SPACING =
  Platform.OS === "ios"
    ? { lineHeight: 22, paddingBottom: 10, paddingTop: 8 }
    : { paddingBottom: 9, paddingTop: 9 };

/**
 * Space to leave below the composer bar for the home indicator or the
 * navigation bar. On iOS it tucks into the home indicator's inset, so the
 * field ends `IOS_EDGE` from the bottom.
 */
export function useComposerBottomInset() {
  const { bottom } = useSafeAreaInsets();
  if (Platform.OS !== "ios") return bottom;
  return bottom === 0 ? 0 : IOS_EDGE - PADDING;
}

function SendButton({
  visible,
  onPress,
}: {
  visible: boolean;
  onPress: () => void;
}) {
  // Always mounted, so it never pops in below the field or resizes.
  const style = useAnimatedStyle(() => ({
    opacity: withTiming(visible ? 1 : 0, { duration: 120 }),
    transform: [{ scale: withTiming(visible ? 1 : 0.7, { duration: 140 }) }],
  }));
  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        { bottom: (CONTROL - SEND) / 2, position: "absolute", right: 4 },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send"
        onPress={onPress}
        className="bg-accent items-center justify-center rounded-full active:opacity-80"
        style={{ height: SEND, width: SEND }}
      >
        <SymbolIcon
          name={{ android: "arrow_upward", ios: "arrow.up" }}
          size={15}
          weight="bold"
          tintColorClassName="accent-on-accent"
        />
      </Pressable>
    </Animated.View>
  );
}

/** The bar's sides, which widen a little while typing on iOS. */
function useSides() {
  const keyboard = useReanimatedKeyboardAnimation();
  return useAnimatedStyle(() => ({
    // eslint-disable-next-line vera/no-layout-animation -- Known: re-lays out the composer on each frame of the keyboard; to be fixed in its own PR.
    paddingHorizontal:
      Platform.OS === "ios"
        ? interpolate(
            keyboard.progress.value,
            [0, 1],
            [IOS_EDGE, IOS_TYPING_EDGE],
          )
        : ANDROID_EDGE,
  }));
}

/**
 * The text being typed and who it @mentions, emptied by `sent`, and kept as
 * a draft on this device (see `drafts.ts`).
 */
function useDraft(
  draftKey: string,
  input: RefObject<TextInput | null>,
  onChangeText: ((text: string, sent: boolean) => void) | undefined,
  mentionable: readonly MentionCandidate[] | undefined,
) {
  const [draft, setDraft] = useState(() => readDraft(draftKey).text);
  const mention = useMentions(draft, mentionable, draftKey, input);
  /** When the field was last emptied by sending, until something is typed. */
  const sentAt = useRef<number | null>(null);

  function show(text: string, sent = false) {
    setDraft(text);
    saveDraftText(draftKey, text);
    onChangeText?.(text, sent);
  }

  function change(text: string, sent = false) {
    // Sending while iOS still offers an autocorrection for the last word
    // (tapping send rather than space) lets the keyboard apply it after the
    // field has cleared, putting that word back. Typing adds a letter at a
    // time, so a whole word landing in the empty field just after a send
    // is the keyboard's, and the field stays empty.
    if (
      sentAt.current !== null &&
      text.length > 1 &&
      Date.now() - sentAt.current < AUTOCORRECT_WINDOW_MS
    ) {
      input.current?.clear();
      return;
    }
    if (text !== "") sentAt.current = null;
    show(mention.edited(text), sent);
  }

  return {
    change,
    draft,
    mention,
    pick: (person: MentionCandidate) => {
      const text = mention.pick(person);
      if (text !== null) show(text);
    },
    /** Empties the field, returning who the sent text mentions. */
    sent: (text: string) => {
      const mentions = mention.take(text);
      change("", true);
      sentAt.current = Date.now();
      return mentions;
    },
  };
}

/** What the composer can be asked to do. */
export interface ComposerHandle {
  /** Puts the cursor in the field, bringing the keyboard up. */
  focus: () => void;
}

/**
 * The bar the field and its "+" menu sit in, moving in from the sides a
 * little on iOS while the keyboard is up.
 */
function Bar({
  bottomInset,
  onHeight,
  children,
}: {
  bottomInset: number;
  onHeight?: (height: number) => void;
  children: ReactNode;
}) {
  const sides = useSides();
  return (
    <Animated.View
      onLayout={(event) => onHeight?.(event.nativeEvent.layout.height)}
      className={cn(
        "flex-row items-end gap-2",
        // No glass on Android: a solid bar, down through the navigation
        // bar, keeps messages from showing through behind the field or the
        // system buttons.
        Platform.OS === "android" && "bg-background border-separator",
      )}
      style={[
        {
          paddingBottom: PADDING + bottomInset,
          paddingTop: PADDING,
          ...(Platform.OS === "android" && {
            borderTopWidth: StyleSheet.hairlineWidth,
          }),
        },
        sides,
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * The message field with its "+" menu and the attachments picked or pasted
 * for the message, which upload only once it's sent. In a group or channel,
 * typing `@` lists the people in it, above the field, to mention. Unsent
 * text and its mentions are kept as a draft on this device (see
 * `drafts.ts`).
 */
export function Composer({
  ref,
  draftKey,
  staged,
  mentionable,
  onSend,
  onPick,
  onPaste,
  onRemoveStaged,
  onChangeText,
  onHeight,
  bottomInset,
  replyingTo,
  onCancelReply,
  placeholder = "Message",
}: {
  ref?: Ref<ComposerHandle>;
  /** From `draftKey`: the account and conversation the draft belongs to. */
  draftKey: string;
  staged: readonly StagedFile[];
  /** Who can be @mentioned; undefined where nobody can. */
  mentionable?: readonly MentionCandidate[];
  /** Sends the text (possibly empty) and who it mentions, with everything staged. */
  onSend: (text: string, mentions: readonly Mention[]) => void;
  onPick: (source: AttachmentSource) => void;
  /** Photos pasted into the field. */
  onPaste: (images: readonly PastedImage[]) => void;
  onRemoveStaged: (id: string) => void;
  /** Every change to the text, including emptying it on send (`sent`). */
  onChangeText?: (text: string, sent: boolean) => void;
  /** The bar's height, without the people listed above it. */
  onHeight?: (height: number) => void;
  /** From `useComposerBottomInset`. */
  bottomInset: number;
  /** Set while the next message is a reply. */
  replyingTo?: ReplyingTo;
  onCancelReply?: () => void;
  placeholder?: string;
}) {
  const input = useRef<TextInput>(null);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));
  // Only the field being pasted into is focused; another conversation's
  // composer can be mounted beneath this one.
  usePastedImages((images) => {
    if (input.current?.isFocused() === true) onPaste(images);
  });
  const { draft, change, mention, pick, sent } = useDraft(
    draftKey,
    input,
    onChangeText,
    mentionable,
  );
  const canSend = draft.trim().length > 0 || staged.length > 0;

  function send() {
    if (!canSend) return;
    const text = draft.trim();
    onSend(text, sent(text));
  }

  return (
    <View>
      {mention.people.length > 0 && (
        <MentionPicker
          people={mention.people}
          inset={Platform.OS === "ios" ? IOS_TYPING_EDGE : ANDROID_EDGE}
          onPick={pick}
        />
      )}
      <Bar bottomInset={bottomInset} onHeight={onHeight}>
        <AttachMenu onPick={onPick} />
        <GlassSurface
          className="flex-1 justify-center rounded-[20px]"
          style={{ minHeight: CONTROL }}
        >
          {replyingTo !== undefined && (
            <ReplyBar
              replyingTo={replyingTo}
              onCancel={() => onCancelReply?.()}
            />
          )}
          <StagedAttachments files={staged} onRemove={onRemoveStaged} />
          <StyledTextInput
            ref={input}
            nativeID={PASTE_IMAGES_NATIVE_ID}
            multiline
            value={draft}
            onChangeText={change}
            onSelectionChange={mention.onSelectionChange}
            placeholder={staged.length > 0 ? "Add a message" : placeholder}
            accessibilityLabel="Message"
            // A message field never needs AutoFill suggestions.
            autoComplete="off"
            textContentType="none"
            className="text-body text-foreground max-h-32 pl-4"
            // The send button floats over this padding, so text never jumps.
            style={{ ...TEXT_SPACING, paddingRight: SEND + 12 }}
            placeholderTextColorClassName="accent-muted"
            cursorColorClassName="accent-accent"
          />
          <SendButton visible={canSend} onPress={send} />
        </GlassSurface>
      </Bar>
    </View>
  );
}

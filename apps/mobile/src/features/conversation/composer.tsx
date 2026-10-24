import type { Mention } from "@decentralized-convex/messages";
import type { ReactNode, Ref, RefObject } from "react";
import { useImperativeHandle, useRef, useState } from "react";
import { Platform, StyleSheet, TextInput, View } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, {
  interpolate,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

import type { ComposerReport } from "./composer-height";
import type { MentionCandidate } from "./mention-text";
import type { ReplyingTo } from "./reply-bar";
import type { EditSession } from "./use-editing";
import type {
  AttachmentSource,
  StagedFile,
} from "~/features/messaging/attachments";
import type { PastedImage } from "~/lib/paste-images";
import { GesturePressable } from "~/components/gesture-pressable";
import { SymbolIcon } from "~/components/symbol-icon";
import { cn } from "~/lib/cn";
import { PASTE_IMAGES_NATIVE_ID, usePastedImages } from "~/lib/paste-images";
import { AttachMenu } from "./attach-menu";
import { readDraft, saveDraftText } from "./drafts";
import { GlassField, useFieldGlass } from "./field-glass";
import { FieldTop } from "./field-top";
import { MentionPicker } from "./mention-picker";
import { canSendNow } from "./use-editing";
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
 * keep it centered. The space under the text is a margin rather than
 * padding: once the field scrolls, iOS keeps the cursor in view but not
 * the padding under it, which left the last line on the field's edge. The
 * field stays `CONTROL` tall.
 */
const TEXT_SPACING =
  Platform.OS === "ios"
    ? { lineHeight: 22, marginBottom: 10, paddingTop: 8 }
    : { paddingBottom: 9, paddingTop: 9 };
/**
 * The field's text: it grows to about ten lines before it scrolls, and the
 * send button floats over its right padding, so text never jumps.
 */
const FIELD_TEXT = { ...TEXT_SPACING, maxHeight: 228, paddingRight: SEND + 12 };

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
  saves,
  onPress,
}: {
  visible: boolean;
  /** It saves an edit rather than sending. */
  saves: boolean;
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
      <GesturePressable
        accessibilityRole="button"
        accessibilityLabel={saves ? "Save" : "Send"}
        onPress={onPress}
        className="bg-accent items-center justify-center rounded-full"
        pressedClassName="opacity-80"
        style={{ height: SEND, width: SEND }}
      >
        <SymbolIcon
          name={
            saves
              ? { android: "check", ios: "checkmark" }
              : { android: "arrow_upward", ios: "arrow.up" }
          }
          size={15}
          weight="bold"
          tintColorClassName="accent-on-accent"
        />
      </GesturePressable>
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
 * How many lines the field measures: an empty field is one line tall,
 * whatever it last held. React Native sizes a field by the text its native
 * view last reported, not by `value`, so a field emptied by sending stayed
 * as tall as the message until that report came back through JavaScript,
 * busy then with the message just sent. Measuring a line at most while
 * it's empty shrinks it in the same frame as its text clears, and keeps it
 * from growing back while the keyboard puts an autocorrected message back
 * (see `useDraft`). Only on iOS, where `numberOfLines` limits just the
 * measuring: on Android it fixes the field's lines, and keeps one after.
 */
function measuredLines(draft: string) {
  return draft === "" && Platform.OS === "ios" ? 1 : undefined;
}

/**
 * What the composer reports of the field's changes. While editing, every
 * change reports an empty field: an edit isn't a new message on its way,
 * so it never shows as typing, and it stops any typing the draft started.
 */
function reportedChanges(
  onChangeText: ((text: string, sent: boolean) => void) | undefined,
  editing: boolean,
) {
  if (!editing || onChangeText === undefined) return onChangeText;
  return (_text: string, sent: boolean) => onChangeText("", sent);
}

/**
 * The text being typed and who it @mentions, emptied by `sent`, and kept as
 * a draft on this device (see `drafts.ts`). A new `draftKey` (an edit's,
 * or back from one) shows that draft instead.
 */
function useDraft(
  draftKey: string,
  input: RefObject<TextInput | null>,
  onChangeText: ((text: string, sent: boolean) => void) | undefined,
  mentionable: readonly MentionCandidate[] | undefined,
) {
  const [draft, setDraft] = useState(() => readDraft(draftKey).text);
  const [shownKey, setShownKey] = useState(draftKey);
  if (shownKey !== draftKey) {
    setShownKey(draftKey);
    setDraft(readDraft(draftKey).text);
  }
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
    /**
     * Who the saved edit mentions. The field then goes back to the draft
     * (a new `draftKey`), so it isn't emptied.
     */
    saved: (text: string) => mention.take(text),
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
  report: { bar, onHeight },
  children,
}: {
  bottomInset: number;
  /** Its height, for the list (see `useComposerHeight`). */
  report: Pick<ComposerReport, "bar" | "onHeight">;
  children: ReactNode;
}) {
  const sides = useSides();
  return (
    <Animated.View
      ref={bar}
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
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
  report,
  bottomInset,
  replyingTo,
  onCancelReply,
  edit,
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
  /**
   * Every change to the text, including emptying it on send (`sent`).
   * See `reportedChanges` for edits.
   */
  onChangeText?: (text: string, sent: boolean) => void;
  /** Its height, for the list (see `useComposerHeight`). */
  report: ComposerReport;
  /** From `useComposerBottomInset`. */
  bottomInset: number;
  /** Set while the next message is a reply. */
  replyingTo?: ReplyingTo;
  onCancelReply?: () => void;
  /**
   * Editing a message of yours (see `useEditing`): while it's `editing`,
   * the field shows its text instead of the draft, with no attachments.
   */
  edit?: EditSession;
  placeholder?: string;
}) {
  const input = useRef<TextInput>(null);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));
  // Only the field being pasted into is focused; another conversation's
  // composer can be mounted beneath this one.
  usePastedImages((images) => {
    if (input.current?.isFocused() === true) onPaste(images);
  });
  const editing = edit?.editing;
  const { draft, change, mention, pick, sent, saved } = useDraft(
    editing === undefined || edit === undefined ? draftKey : edit.editDraftKey,
    input,
    reportedChanges(onChangeText, editing !== undefined),
    mentionable,
  );
  const { field, held, settle, focus } = useFieldGlass(report);
  const canSend = canSendNow(draft, staged, editing);
  const saves = editing !== undefined;
  const hint = staged.length > 0 || saves ? "Add a message" : placeholder;

  function send() {
    if (!canSend) return;
    settle();
    const text = draft.trim();
    if (editing === undefined) onSend(text, sent(text));
    else edit?.save(text, saved(text));
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
      <Bar bottomInset={bottomInset} report={report}>
        {/* An edit changes only the text. */}
        {editing === undefined && <AttachMenu onPick={onPick} />}
        <GlassField field={field} held={held} minHeight={CONTROL}>
          <FieldTop
            edit={edit}
            replyingTo={replyingTo}
            onCancelReply={() => onCancelReply?.()}
            staged={staged}
            onRemoveStaged={onRemoveStaged}
          />
          <StyledTextInput
            ref={input}
            nativeID={PASTE_IMAGES_NATIVE_ID}
            {...focus}
            multiline
            numberOfLines={measuredLines(draft)}
            value={draft}
            onChangeText={change}
            onSelectionChange={mention.onSelectionChange}
            placeholder={hint}
            accessibilityLabel="Message"
            // A message field never needs AutoFill suggestions.
            autoComplete="off"
            textContentType="none"
            className="text-body text-foreground pl-4"
            style={FIELD_TEXT}
            placeholderTextColorClassName="accent-muted"
            cursorColorClassName="accent-accent"
          />
          <SendButton visible={canSend} saves={saves} onPress={send} />
        </GlassField>
      </Bar>
    </View>
  );
}

import type { ReactNode, RefObject } from "react";
import { useRef, useState } from "react";
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
import type { ComposerProps } from "./composer-props";
import type { MentionCandidate } from "./mention-text";
import { GesturePressable } from "~/components/gesture-pressable";
import { SymbolIcon } from "~/components/symbol-icon";
import { useSendProbe } from "~/features/dev/send-timing";
import { ComposerLayout } from "~/features/native-list/composer-layout";
import { cn } from "~/lib/cn";
import { PASTE_IMAGES_NATIVE_ID } from "~/lib/paste-images";
import { AttachMenu } from "./attach-menu";
import { useComposerCommit } from "./composer-commit";
import { useComposerInput } from "./composer-input";
import { composerSubmission } from "./composer-submission";
import { readDraft, saveDraftText } from "./drafts";
import { GlassField, useFieldGlass } from "./field-glass";
import { SEND, useFieldText } from "./field-text";
import { FieldTop } from "./field-top";
import { MentionPicker } from "./mention-picker";
import { canSendNow } from "./use-editing";
import { useMentions } from "./use-mentions";

const StyledTextInput = withUniwind(TextInput);
/** Every control in the composer shares this height so they line up. */
const CONTROL = 40;
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
  const [written, setDraft] = useState(() => ({
    text: readDraft(draftKey).text,
    clear: 0,
  }));
  const { text: draft, clear } = written;
  const [shownKey, setShownKey] = useState(draftKey);
  if (shownKey !== draftKey) {
    setShownKey(draftKey);
    setDraft({ text: readDraft(draftKey).text, clear });
  }
  const mention = useMentions(draft, mentionable, draftKey, input);
  /** When the field was last emptied by sending, until something is typed. */
  const sentAt = useRef<number | null>(null);

  function show(text: string, sent = false) {
    setDraft((current) => ({ text, clear: current.clear + (sent ? 1 : 0) }));
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
    clear,
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
}: ComposerProps) {
  const input = useComposerInput(ref, onPaste);
  const editing = edit?.editing;
  const { draft, clear, change, mention, pick, sent, saved } = useDraft(
    editing === undefined || edit === undefined ? draftKey : edit.editDraftKey,
    input,
    reportedChanges(onChangeText, editing !== undefined),
    mentionable,
  );
  const { glass, settle, focus } = useFieldGlass(report);
  const submission = useComposerCommit(
    report,
    clear,
    staged.map((file) => file.id),
  );
  const fieldText = useFieldText(draft);
  const canSend = canSendNow(draft, staged, editing);
  const saves = editing !== undefined;
  const hint = staged.length > 0 || saves ? "Add a message" : placeholder;
  const probe = useSendProbe(report, glass.field, input, { draft, hint });

  const send = composerSubmission(
    { canSend, edit, onSend },
    { draft, clear, sent, saved },
    report.sendCommit,
    { settle, staged, begin: probe.begin },
  );

  return (
    <View>
      {mention.people.length > 0 && (
        <MentionPicker
          people={mention.people}
          inset={Platform.OS === "ios" ? IOS_TYPING_EDGE : ANDROID_EDGE}
          onPick={pick}
        />
      )}
      <ComposerLayout
        owner={report.sendCommit.owner}
        sequence={submission.sequence}
      >
        <Bar bottomInset={bottomInset} report={probe.report}>
          {/* An edit changes only the text. */}
          {editing === undefined && <AttachMenu onPick={onPick} />}
          <GlassField {...glass} minHeight={CONTROL}>
            <FieldTop
              edit={edit}
              replyingTo={replyingTo}
              onCancelReply={() => onCancelReply?.()}
              staged={staged}
              onRemoveStaged={onRemoveStaged}
              send={submission.sequence}
            />
            <StyledTextInput
              ref={input}
              nativeID={PASTE_IMAGES_NATIVE_ID}
              {...focus}
              multiline
              value={draft}
              onChangeText={change}
              onSelectionChange={mention.onSelectionChange}
              placeholder={hint}
              accessibilityLabel="Message"
              // A message field never needs AutoFill suggestions.
              autoComplete="off"
              textContentType="none"
              className="text-body text-foreground pl-4"
              {...fieldText}
              placeholderTextColorClassName="accent-muted"
              cursorColorClassName="accent-accent"
            />
            <SendButton visible={canSend} saves={saves} onPress={send} />
          </GlassField>
        </Bar>
      </ComposerLayout>
    </View>
  );
}

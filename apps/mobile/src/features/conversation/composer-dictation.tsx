import type { ReactNode, RefObject } from "react";
import type { TextInput } from "react-native";
import type { AnimatedRef } from "react-native-reanimated";
import { View } from "react-native";
import Animated, { useAnimatedRef } from "react-native-reanimated";

import type { ComposerProps } from "./composer-props";
import { DictationControls } from "~/features/dictation/controls";
import { useDictationField } from "~/features/dictation/field";
import {
  cancelDictation,
  canDictate,
  finishDictation,
  startDictation,
  useDictationPhase,
} from "~/features/dictation/session";
import { AttachMenu } from "./attach-menu";
import { FieldButtons } from "./field-buttons";
import { CONTROL, SEND } from "./field-text";

/**
 * Dictating into the draft `key` from this composer (see
 * `features/dictation`): its phase and the buttons' actions. Confirming
 * adds the words to the field and puts the cursor after them.
 */
export function useComposerDictation(
  key: string,
  input: RefObject<TextInput | null>,
  replace: (text: string) => void,
) {
  const phase = useDictationPhase(key);
  return {
    available: canDictate(),
    phase,
    start: () => startDictation(key),
    cancel: () => cancelDictation(key),
    confirm: () => {
      void finishDictation(key).then((text) => {
        if (text === null) return;
        replace(text);
        input.current?.focus();
        requestAnimationFrame(() =>
          input.current?.setSelection(text.length, text.length),
        );
      });
    },
  };
}

/**
 * The field's text and what's above it, which shrink to a line and fade
 * out while dictating (see `useDictationField`). `inner` keeps their own
 * height, for the field to grow back to.
 */
function DictatedContent({
  inner,
  style,
  children,
}: {
  inner: AnimatedRef<View>;
  style: ReturnType<typeof useDictationField>["content"];
  children: ReactNode;
}) {
  return (
    <Animated.View className="justify-end overflow-hidden" style={style}>
      <Animated.View ref={inner}>{children}</Animated.View>
    </Animated.View>
  );
}

/**
 * What's in the message field: `children` (the text and what's above
 * it), the buttons over its right side, and dictation's controls in
 * place of all of them while dictating into the draft `dictationKey`.
 */
export function FieldBody({
  dictationKey,
  dictation,
  canSend,
  saves,
  onSend,
  children,
}: {
  dictationKey: string;
  dictation: ReturnType<typeof useComposerDictation>;
  canSend: boolean;
  saves: boolean;
  onSend: () => void;
  children: ReactNode;
}) {
  const inner = useAnimatedRef<View>();
  const field = useDictationField(dictationKey, CONTROL, inner);
  return (
    <>
      <DictatedContent inner={inner} style={field.content}>
        {children}
      </DictatedContent>
      <FieldButtons
        idle={dictation.phase === "idle"}
        style={field.buttons}
        canSend={canSend}
        saves={saves}
        onSend={onSend}
        onDictate={dictation.available ? dictation.start : undefined}
      />
      {dictation.available && (
        <DictationControls
          phase={dictation.phase}
          height={CONTROL}
          button={SEND}
          style={field.controls}
          onCancel={dictation.cancel}
          onConfirm={dictation.confirm}
        />
      )}
    </>
  );
}

/** The "+" menu, which does nothing while dictating. */
export function ComposerAttach({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick: ComposerProps["onPick"];
}) {
  return (
    <View pointerEvents={enabled ? "auto" : "none"}>
      <AttachMenu onPick={onPick} />
    </View>
  );
}

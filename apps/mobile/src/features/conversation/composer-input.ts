import type { Ref } from "react";
import type { TextInput } from "react-native";
import { useImperativeHandle, useRef } from "react";

import type { ComposerHandle } from "./composer";
import type { PastedImage } from "~/lib/paste-images";
import { useFocusedPastedImages } from "~/lib/paste-images";

/** Keeps the same input handle and focused-paste subscription across renders. */
export function useComposerInput(
  ref: Ref<ComposerHandle> | undefined,
  onPaste: (images: readonly PastedImage[]) => void,
) {
  const input = useRef<TextInput>(null);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));
  useFocusedPastedImages(input, onPaste);
  return input;
}

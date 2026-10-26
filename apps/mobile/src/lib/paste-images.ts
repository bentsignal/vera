import type { RefObject } from "react";
import type { TextInput } from "react-native";
import {
  EventEmitter,
  requireOptionalNativeModule,
  useEventListener,
} from "expo";

/** A pasted photo, saved to a file in the cache. */
export interface PastedImage {
  readonly height: number;
  readonly mimeType: string;
  readonly name: string;
  readonly size: number;
  readonly uri: string;
  readonly width: number;
}

// A `Record`, not an interface, so it fits `EventEmitter`'s events map.
type PasteEvents = Record<
  "onPasteImages",
  (event: { images: PastedImage[] }) => void
>;

type PasteImagesModule = InstanceType<typeof EventEmitter<PasteEvents>>;

/**
 * Give a `TextInput` this `nativeID` to let it take pasted photos. The
 * native module (`modules/paste-images`) matches it.
 */
export const PASTE_IMAGES_NATIVE_ID = "vera-paste-images";

// `modules/paste-images`, loaded optionally: builds made before it was
// added just don't offer to paste photos.
const pasteImages =
  requireOptionalNativeModule<PasteImagesModule>("VeraPasteImages") ??
  new EventEmitter<PasteEvents>();

/**
 * Calls `onPaste` with the photos pasted into any `TextInput` that has
 * `PASTE_IMAGES_NATIVE_ID`. Pasting photos inserts no text.
 */
export function usePastedImages(
  onPaste: (images: readonly PastedImage[]) => void,
) {
  useEventListener(pasteImages, "onPasteImages", ({ images }) =>
    onPaste(images),
  );
}

/** Only the focused composer receives a paste when routes stay mounted. */
export function useFocusedPastedImages(
  input: RefObject<TextInput | null>,
  onPaste: (images: readonly PastedImage[]) => void,
) {
  usePastedImages((images) => {
    if (input.current?.isFocused() === true) onPaste(images);
  });
}

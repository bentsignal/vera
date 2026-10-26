import { Platform, useWindowDimensions } from "react-native";

import { emptyFieldMaxHeight } from "./empty-field";

// The composer's message field: how its text sits, and how tall it
// measures (see `Composer`).

/** The send button's size, which floats over the field's right padding. */
export const SEND = 32;
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
 * field stays the composer's `CONTROL` tall.
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
 * The field's lines and text style for `draft`. Emptied by sending, it's
 * a line tall in the same render: on iOS by measuring a line
 * (`measuredLines`), on Android by its most height (see
 * `emptyFieldMaxHeight`).
 */
export function useFieldText(draft: string) {
  const { fontScale } = useWindowDimensions();
  const empty = draft === "" && Platform.OS === "android";
  return {
    numberOfLines: measuredLines(draft),
    style: empty
      ? { ...FIELD_TEXT, maxHeight: emptyFieldMaxHeight(fontScale) }
      : FIELD_TEXT,
  };
}

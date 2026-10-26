/** The field's text size (`text-body`) and its padding on Android. */
const BODY_SIZE = 17;
const ANDROID_PADDING = 9 + 9;
/** Android lays a line of Roboto out at about 1.17 times its size: some room over that. */
const ANDROID_LINE = 1.25;

/**
 * The most an empty field can measure on Android: one line, at the
 * system's font scale. React Native sizes a multiline field by the text
 * its native view last reported, which comes back through JavaScript
 * (busy with the message just sent), so a field emptied by sending stayed
 * as tall as the message for about a second. A `maxHeight` in the render
 * that empties it shrinks it at once. iOS measures an empty field a line
 * tall with `numberOfLines` instead (see `measuredLines`).
 */
export function emptyFieldMaxHeight(fontScale: number) {
  return Math.ceil(ANDROID_PADDING + BODY_SIZE * ANDROID_LINE * fontScale);
}

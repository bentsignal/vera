// How far the jump button rises from the screen's bottom: over the
// composer, wherever the keyboard has taken it. Plain math, tested on its
// own (see `JumpToLatest`).

/**
 * The composer's top above the screen's bottom, in points: its height,
 * plus how far the keyboard has lifted it. The composer rises as
 * `KeyboardStickyView` moves it (floating-composer.tsx): the keyboard's
 * height (`keyboardHeight`, negative while it's up, as
 * react-native-keyboard-controller reports it) less the composer's own
 * bottom inset, which goes behind the keyboard as it opens (`progress`, 0
 * closed to 1 open).
 */
export function composerTop({
  composer,
  keyboardHeight,
  progress,
  bottomInset,
}: {
  composer: number;
  keyboardHeight: number;
  progress: number;
  bottomInset: number;
}) {
  "worklet";
  return composer - (keyboardHeight + progress * bottomInset);
}

/**
 * Touch handlers for a sheet's native host that put the keyboard away when
 * its list is dragged. iOS does it in the form itself
 * (`dismissKeyboardOnScroll`), so here there are none; see
 * `dismiss-keyboard-on-drag.android.ts`.
 */
export function useDismissKeyboardOnDrag() {
  return {};
}

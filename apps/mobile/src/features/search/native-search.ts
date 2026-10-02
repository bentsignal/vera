import type { SearchBarCommands } from "react-native-screens";
import { createRef } from "react";

/**
 * The Search tab's native search bar. On iOS 27 the tab is a detached
 * `UISearchTab` (see the react-native-screens patch in the README), and
 * selecting it should put the field over the keyboard right away.
 */
export const nativeSearchBarRef = createRef<SearchBarCommands>();

export function focusNativeSearch() {
  nativeSearchBarRef.current?.focus();
}

export function blurNativeSearch() {
  nativeSearchBarRef.current?.blur();
}

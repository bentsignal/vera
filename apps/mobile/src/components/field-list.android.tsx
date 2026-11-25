import type { ModifierConfig } from "@expo/ui/jetpack-compose/modifiers";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LazyColumn, useMaterialColors } from "@expo/ui/jetpack-compose";
import { background, fillMaxSize } from "@expo/ui/jetpack-compose/modifiers";

import { ANDROID_TAB_BAR } from "./tab-bar";

/**
 * Android `FieldList`: the same spacing and surface as `FieldGroup`, with
 * each section component rendered as its own item. See `field-list.tsx`.
 */
export function FieldList({
  modifiers,
  clearsNavigationBar = false,
  clearsTabBar = false,
  children,
}: {
  modifiers?: ModifierConfig[];
  /**
   * Keeps the end of the list clear of the system's bottom bar, which
   * screens outside the tabs draw under.
   */
  clearsNavigationBar?: boolean;
  /**
   * Keeps the end of the list clear of the tab bar, on Home's screens,
   * which the tabs don't inset (see the tabs layout).
   */
  clearsTabBar?: boolean;
  children: ReactNode;
}) {
  const colors = useMaterialColors();
  const insets = useSafeAreaInsets();
  const bottom =
    16 +
    (clearsNavigationBar || clearsTabBar ? insets.bottom : 0) +
    (clearsTabBar ? ANDROID_TAB_BAR : 0);
  return (
    <LazyColumn
      verticalArrangement={{ spacedBy: 24 }}
      contentPadding={{ bottom, end: 16, start: 16, top: 16 }}
      modifiers={[
        fillMaxSize(),
        background(colors.surface),
        ...(modifiers ?? []),
      ]}
    >
      {children}
    </LazyColumn>
  );
}

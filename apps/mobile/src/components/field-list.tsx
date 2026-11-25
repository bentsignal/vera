import type { ModifierConfig } from "@expo/ui/swift-ui/modifiers";
import type { ReactNode } from "react";
import { FieldGroup } from "@expo/ui";

/**
 * A grouped list of `FieldGroup.Section`s, for screens built from section
 * components (each rendering exactly one section). On iOS it is
 * `FieldGroup`. On Android, `FieldGroup` wraps any child that isn't a
 * literal section in another section, so section components came out as
 * cards inside cards (and a section component that renders nothing left
 * an empty card); `field-list.android.tsx` lists them as they are.
 */
export function FieldList({
  modifiers,
  children,
}: {
  modifiers?: ModifierConfig[];
  /**
   * Android only: keeps the end of the list clear of the system's bottom
   * bar, on screens outside the tabs. iOS insets the list itself.
   */
  clearsNavigationBar?: boolean;
  /**
   * Android only: keeps the end of the list clear of the tab bar, on
   * Home's screens. iOS insets the list itself.
   */
  clearsTabBar?: boolean;
  children: ReactNode;
}) {
  return <FieldGroup modifiers={modifiers}>{children}</FieldGroup>;
}

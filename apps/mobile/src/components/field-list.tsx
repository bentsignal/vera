import type { ModifierConfig } from "@expo/ui/swift-ui/modifiers";
import type { ReactNode } from "react";
import { FieldGroup } from "@expo/ui";

/**
 * A grouped list of `FieldGroup.Section`s, for screens built from section
 * components (each rendering exactly one section). On iOS it is
 * `FieldGroup`. On Android, `FieldGroup` wraps any child that isn't a
 * literal section in another section, so section components came out as
 * cards inside cards; `field-list.android.tsx` lists them as they are.
 */
export function FieldList({
  modifiers,
  children,
}: {
  modifiers?: ModifierConfig[];
  children: ReactNode;
}) {
  return <FieldGroup modifiers={modifiers}>{children}</FieldGroup>;
}

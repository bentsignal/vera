import type { ModifierConfig } from "@expo/ui/jetpack-compose/modifiers";
import type { ReactNode } from "react";
import { LazyColumn, useMaterialColors } from "@expo/ui/jetpack-compose";
import { background, fillMaxSize } from "@expo/ui/jetpack-compose/modifiers";

/**
 * Android `FieldList`: the same spacing and surface as `FieldGroup`, with
 * each section component rendered as its own item. See `field-list.tsx`.
 */
export function FieldList({
  modifiers,
  children,
}: {
  modifiers?: ModifierConfig[];
  children: ReactNode;
}) {
  const colors = useMaterialColors();
  return (
    <LazyColumn
      verticalArrangement={{ spacedBy: 24 }}
      contentPadding={{ bottom: 16, end: 16, start: 16, top: 16 }}
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

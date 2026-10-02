import type { ComponentProps } from "react";
import { Host } from "@expo/ui";
import { useCSSVariable } from "uniwind";

/**
 * `@expo/ui` Host tinted with the app accent, so native controls match the
 * Uniwind theme.
 */
export function NativeHost(props: ComponentProps<typeof Host>) {
  const accent = useCSSVariable("--color-accent");
  return (
    <Host
      seedColor={typeof accent === "string" ? accent : undefined}
      {...props}
    />
  );
}

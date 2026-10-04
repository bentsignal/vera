import type { ComponentProps } from "react";
import { useColorScheme } from "react-native";
import { Host } from "@expo/ui";
import { useCSSVariable } from "uniwind";

/**
 * `@expo/ui` Host tinted with the app accent and set to the app's light or
 * dark appearance (Settings can override the system's), so native controls
 * match the Uniwind theme. Without the explicit scheme, Compose follows the
 * system and draws dark text on the app's dark background.
 */
export function NativeHost(props: ComponentProps<typeof Host>) {
  const accent = useCSSVariable("--color-accent");
  const scheme = useColorScheme();
  return (
    <Host
      seedColor={typeof accent === "string" ? accent : undefined}
      colorScheme={scheme === "dark" ? "dark" : "light"}
      {...props}
    />
  );
}

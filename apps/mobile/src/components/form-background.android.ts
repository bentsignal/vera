import { useColorScheme } from "react-native";
import { useMaterialColors } from "@expo/ui/jetpack-compose";
import { useCSSVariable } from "uniwind";

/**
 * Android `useFormBackground`: the surface color `FieldGroup` paints, from
 * the same accent seed and scheme `NativeHost` uses. See
 * `form-background.ts`.
 */
export function useFormBackground() {
  const accent = useCSSVariable("--color-accent");
  const scheme = useColorScheme();
  return useMaterialColors({
    colorScheme: scheme === "dark" ? "dark" : "light",
    seedColor: typeof accent === "string" ? accent : undefined,
  }).surface;
}

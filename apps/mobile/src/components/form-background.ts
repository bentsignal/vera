import { PlatformColor } from "react-native";

/**
 * The color a `FieldGroup` paints behind its sections, for views that sit
 * beside one on the same screen, such as a button bar under a form. iOS
 * resolves it like the form does, so it is a shade lighter in a sheet.
 * Android takes it from the Material palette in `form-background.android.ts`.
 */
export function useFormBackground() {
  return PlatformColor("systemGroupedBackground");
}

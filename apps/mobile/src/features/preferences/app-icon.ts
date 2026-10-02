import { useState } from "react";
import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

import type { ThemeId } from "./themes";
import { isThemeId } from "./themes";

/** The native side of `expo-alternate-app-icons`. */
interface AlternateIconsModule {
  readonly supportsAlternateIcons: boolean;
  getAppIconName: () => string | null;
  setAlternateAppIcon: (name: string | null) => Promise<string | null>;
}

// Optional, so builds made before the module was added keep running; they
// just don't offer icon choices.
const native =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<AlternateIconsModule>("ExpoAlternateAppIcons")
    : null;

/** Indigo is the primary icon; each other theme has `vera-<theme>`. */
function themeOfIcon(name: string | null) {
  const theme = name?.replace(/^vera-/, "");
  return isThemeId(theme) ? theme : "indigo";
}

/**
 * The home screen icon, one per color theme (iOS only). `available` is
 * false where the platform or build can't switch icons.
 */
export function useAppIcon() {
  const [icon, setIcon] = useState<ThemeId>(() =>
    themeOfIcon(native?.getAppIconName() ?? null),
  );
  return {
    available: native?.supportsAlternateIcons === true,
    icon,
    setIcon: async (theme: ThemeId) => {
      if (native === null) return;
      await native.setAlternateAppIcon(
        theme === "indigo" ? null : `vera-${theme}`,
      );
      setIcon(theme);
    },
  };
}

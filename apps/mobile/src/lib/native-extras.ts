import { requireOptionalNativeModule } from "expo";

// Haptics and the clipboard, loaded optionally: builds made before these
// modules were added keep working and simply skip them.

interface HapticsModule {
  impactAsync: (style: "heavy" | "light" | "medium") => Promise<void>;
  selectionAsync: () => Promise<void>;
}

interface ClipboardModule {
  setStringAsync: (
    content: string,
    options: { inputFormat: "plainText" },
  ) => Promise<boolean>;
}

const haptics = requireOptionalNativeModule<HapticsModule>("ExpoHaptics");
const clipboard = requireOptionalNativeModule<ClipboardModule>("ExpoClipboard");

/** A firm tap, as when a long press opens a menu. */
export function impact() {
  void haptics?.impactAsync("medium").catch(() => undefined);
}

/** A light tick, as when a choice is made. */
export function selectionTick() {
  void haptics?.selectionAsync().catch(() => undefined);
}

/** Whether this build can copy text. */
export const canCopy = clipboard !== null;

export function copyText(text: string) {
  void clipboard
    ?.setStringAsync(text, { inputFormat: "plainText" })
    .catch(() => false);
}

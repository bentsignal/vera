import type { Hotkey } from "@acme/features/shortcuts";

export function getShortcutString(hotkey: Hotkey) {
  const keys = [];
  if (hotkey.ctrlCmd) keys.push("⌘");
  if (hotkey.shift) keys.push("⇧");
  if (hotkey.alt) keys.push("⌥");
  keys.push(hotkey.key);
  return keys.join(" + ");
}

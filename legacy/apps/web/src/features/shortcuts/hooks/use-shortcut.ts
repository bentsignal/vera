import { useEffect } from "react";

import type { Hotkey } from "@acme/features/shortcuts";

function matchesKey(e: KeyboardEvent, hotkey: Hotkey) {
  return e.key.toUpperCase() === hotkey.key.toUpperCase();
}

function matchesShift(e: KeyboardEvent, hotkey: Hotkey) {
  return hotkey.shift ? e.shiftKey : !e.shiftKey;
}

function matchesCtrlCmd(e: KeyboardEvent, hotkey: Hotkey) {
  if (hotkey.ctrlCmd) return e.ctrlKey || e.metaKey;
  return !e.ctrlKey && !e.metaKey;
}

function matchesAlt(e: KeyboardEvent, hotkey: Hotkey) {
  return hotkey.alt ? e.altKey : !e.altKey;
}

function matchesHotkey(e: KeyboardEvent, hotkey: Hotkey) {
  return (
    matchesKey(e, hotkey) &&
    matchesShift(e, hotkey) &&
    matchesCtrlCmd(e, hotkey) &&
    matchesAlt(e, hotkey)
  );
}

export function useShortcut({
  hotkey,
  callback,
}: {
  hotkey: Hotkey;
  callback: () => void;
}) {
  // eslint-disable-next-line no-restricted-syntax -- Effect needed to register keyboard event listeners
  useEffect(() => {
    const controller = new AbortController();

    window.addEventListener(
      "keydown",
      (e: KeyboardEvent) => {
        if (matchesHotkey(e, hotkey)) {
          e.preventDefault();
          e.stopPropagation();
          callback();
        }
      },
      { signal: controller.signal, capture: true },
    );

    return () => {
      controller.abort();
    };
  }, [hotkey, callback]);
}

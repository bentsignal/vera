import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";

/** How long a toast stays up. */
const SHOWN_MS = 2200;
/** How long its glass takes to dissolve before it's gone. */
const LEAVING_MS = 300;

interface Toast {
  readonly id: number;
  readonly message: string;
  readonly shown: boolean;
}

let current: Toast | undefined;
let nextId = 1;
const timers = new Set<ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

function set(next: Toast | undefined) {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Shows `message` briefly at the top of the screen, over everything, for
 * something that can't be done right now. A new one replaces the last.
 */
export function showToast(message: string) {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  const id = nextId++;
  set({ id, message, shown: true });
  AccessibilityInfo.announceForAccessibility(message);
  timers.add(setTimeout(() => set({ id, message, shown: false }), SHOWN_MS));
  timers.add(setTimeout(() => set(undefined), SHOWN_MS + LEAVING_MS));
}

/** The toast showing, if any, for `ToastHost`. */
export function useToast() {
  return useSyncExternalStore(subscribe, () => current);
}

import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";
import { Uniwind } from "uniwind";

import type { ThemeId } from "./themes";
import { applyTheme, isThemeId } from "./themes";

const STORAGE_KEY = "vera.preferences";

export type Appearance = "dark" | "light" | "system";
export type MessageLayout = "bubbles" | "stacked";

export interface Preferences {
  readonly appearance: Appearance;
  readonly messageLayout: MessageLayout;
  readonly theme: ThemeId;
}

const DEFAULTS = {
  appearance: "system",
  messageLayout: "bubbles",
  theme: "blue",
} satisfies Preferences;

function pick<Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  fallback: Value,
) {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

function themeOr(value: unknown, fallback: ThemeId) {
  return isThemeId(value) ? value : fallback;
}

function fromStored(stored: unknown) {
  if (typeof stored !== "object" || stored === null) return DEFAULTS;
  return {
    appearance: pick(
      Reflect.get(stored, "appearance"),
      ["system", "light", "dark"],
      DEFAULTS.appearance,
    ),
    messageLayout: pick(
      Reflect.get(stored, "messageLayout"),
      ["bubbles", "stacked"],
      DEFAULTS.messageLayout,
    ),
    theme: themeOr(Reflect.get(stored, "theme"), DEFAULTS.theme),
  } satisfies Preferences;
}

function load() {
  try {
    return fromStored(JSON.parse(SecureStore.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<() => void>();

function apply(preferences: Preferences) {
  Uniwind.setTheme(preferences.appearance);
  applyTheme(preferences.theme);
}

/** Applies saved preferences; call once before the first render. */
export function applyStoredPreferences() {
  apply(current);
}

export function setPreference<Key extends keyof Preferences>(
  key: Key,
  value: Preferences[Key],
) {
  current = { ...current, [key]: value };
  SecureStore.setItem(STORAGE_KEY, JSON.stringify(current));
  apply(current);
  for (const listener of listeners) listener();
}

export function usePreference<Key extends keyof Preferences>(key: Key) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current[key],
  );
}

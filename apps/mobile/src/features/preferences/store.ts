import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";
import { Uniwind } from "uniwind";

import type { ThemeId } from "./themes";
import type { ConversationKind } from "~/features/inbox/types";
import { applyTheme, isThemeId } from "./themes";

const STORAGE_KEY = "vera.preferences";

export type Appearance = "dark" | "light" | "system";
export type MessageLayout = "bubbles" | "stacked";

export interface Preferences {
  readonly appearance: Appearance;
  /** Message layout for each kind of conversation. */
  readonly directLayout: MessageLayout;
  readonly groupLayout: MessageLayout;
  readonly channelLayout: MessageLayout;
  readonly theme: ThemeId;
}

const DEFAULTS = {
  appearance: "system",
  directLayout: "bubbles",
  groupLayout: "stacked",
  channelLayout: "stacked",
  theme: "blue",
} satisfies Preferences;

const LAYOUTS = ["bubbles", "stacked"] as const;

/** The preference holding the message layout for a kind of conversation. */
export const LAYOUT_PREFERENCE = {
  direct: "directLayout",
  group: "groupLayout",
  channel: "channelLayout",
} as const satisfies Record<ConversationKind, keyof Preferences>;

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
    directLayout: pick(
      Reflect.get(stored, "directLayout"),
      LAYOUTS,
      DEFAULTS.directLayout,
    ),
    groupLayout: pick(
      Reflect.get(stored, "groupLayout"),
      LAYOUTS,
      DEFAULTS.groupLayout,
    ),
    channelLayout: pick(
      Reflect.get(stored, "channelLayout"),
      LAYOUTS,
      DEFAULTS.channelLayout,
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

/** The message layout for a kind of conversation, once its kind is known. */
export function useMessageLayout(kind: ConversationKind | undefined) {
  const layout = usePreference(LAYOUT_PREFERENCE[kind ?? "direct"]);
  return kind === undefined ? undefined : layout;
}

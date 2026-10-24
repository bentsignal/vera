import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";

import { env } from "~/env";
import { CONTRACT_VERSION, MessageListView, nativeSupport } from "./native";

// Whether conversations use the native message list or the React Native
// one (see .plans/native-message-list.md → Switching to it). Decided in
// JavaScript, so an over-the-air update can flip it either way.

const previewBuild = Updates.channel === "preview";

export const NATIVE_LIST = {
  /**
   * Whether it's on for people who haven't chosen. On in dev builds, so
   * every dev client tries it, and on in private preview builds. Store
   * builds stay off until Shawn has tried it in his group chat.
   */
  byDefault: env.devTools || previewBuild,
  /** Private production builds expose the switch for every signed-in account. */
  previewBuild,
  /**
   * Accounts that see the switch in production builds, where the
   * Developer section is hidden (More → About). Dev builds show it to
   * everyone.
   */
  testers: new Set(["shawn@vera.chat"]),
};

const STORAGE_KEY = "vera.nativeList";

const CHOICES = ["on", "off"] as const;

function load() {
  try {
    const stored = SecureStore.getItem(STORAGE_KEY);
    return CHOICES.find((choice) => choice === stored);
  } catch {
    return undefined;
  }
}

let choice = load();
const listeners = new Set<() => void>();

/** Turns the native list on or off on this device. */
export function setNativeList(on: boolean) {
  choice = on ? "on" : "off";
  SecureStore.setItem(STORAGE_KEY, choice);
  for (const listener of listeners) listener();
}

function isOn(chosen: (typeof CHOICES)[number] | undefined) {
  return chosen === undefined ? NATIVE_LIST.byDefault : chosen === "on";
}

/** Whether the native list is on here, outside React (dev scripts). */
export function nativeListOn() {
  return isOn(choice);
}

/** Whether the native list is on here: chosen, or the default. */
export function useNativeListOn() {
  const chosen = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => choice,
  );
  return isOn(chosen);
}

/** Whether this binary has a native list this JavaScript can talk to. */
export const nativeListInstalled =
  MessageListView !== null &&
  nativeSupport !== null &&
  nativeSupport.contractVersion === CONTRACT_VERSION;

/** Whether conversations use the native list. */
export function useNativeList() {
  return useNativeListOn() && nativeListInstalled;
}

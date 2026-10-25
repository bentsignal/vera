import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";

import { CONTRACT_VERSION, MessageListView, nativeSupport } from "./native";

// Whether conversations use the native message list or the React Native
// one (see .plans/native-message-list.md → Switching to it). Decided in
// JavaScript, so an over-the-air update can flip it either way.

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
  return chosen !== "off";
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

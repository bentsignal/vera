import { useSyncExternalStore } from "react";

/**
 * Stand-in for the Better Auth passkey session. Delete once real sign-in
 * lands; screens only depend on `useIsSignedIn`, `signIn`, and `signOut`.
 */
let signedIn = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setSignedIn(value: boolean) {
  signedIn = value;
  for (const listener of listeners) listener();
}

export function useIsSignedIn() {
  return useSyncExternalStore(subscribe, () => signedIn);
}

export function signIn() {
  setSignedIn(true);
}

export function signOut() {
  setSignedIn(false);
}

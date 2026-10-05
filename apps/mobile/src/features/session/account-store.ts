import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";

import { env } from "~/env";

const STORAGE_KEY = "vera.accounts";

/** A signed-in account, and where its auth cookies are stored. */
export interface StoredAccount {
  /** Account address, such as `maya@vera.chat`. */
  readonly address: string;
  /** The account domain whose PDS is the account's home. */
  readonly domain: string;
  /** SecureStore key prefix for this account's Better Auth session. */
  readonly storagePrefix: string;
}

function isStoredAccount(value: unknown): value is StoredAccount {
  return (
    typeof value === "object" &&
    value !== null &&
    "address" in value &&
    typeof value.address === "string" &&
    "domain" in value &&
    typeof value.domain === "string" &&
    "storagePrefix" in value &&
    typeof value.storagePrefix === "string"
  );
}

function emailOf(session: unknown) {
  const user =
    typeof session === "object" && session !== null && "user" in session
      ? session.user
      : undefined;
  return typeof user === "object" &&
    user !== null &&
    "email" in user &&
    typeof user.email === "string"
    ? user.email.toLowerCase()
    : null;
}

/** The address in a Better Auth session cached under `storagePrefix`. */
export function cachedSessionAddress(storagePrefix: string) {
  try {
    return emailOf(
      JSON.parse(
        SecureStore.getItem(`${storagePrefix}_session_data`) ?? "null",
      ),
    );
  } catch {
    return null;
  }
}

/**
 * Before multi-account, the one session lived under `vera-<domain>`. Adopt it
 * as the first account so upgrading keeps people signed in.
 */
function legacyAccounts() {
  const storagePrefix = `vera-${env.veraDomain}`;
  const address = cachedSessionAddress(storagePrefix);
  return address === null
    ? []
    : [{ address, domain: env.veraDomain, storagePrefix }];
}

function fromStored(stored: unknown) {
  if (typeof stored !== "object" || stored === null) {
    return { accounts: [], filter: null };
  }
  const accounts =
    "accounts" in stored
      ? [stored.accounts].flat().filter(isStoredAccount)
      : [];
  const filter = "filter" in stored ? stored.filter : null;
  return {
    accounts,
    filter:
      accounts.find((account) => account.address === filter)?.address ?? null,
  };
}

function load() {
  const raw = SecureStore.getItem(STORAGE_KEY);
  if (raw === null) return { accounts: legacyAccounts(), filter: null };
  try {
    return fromStored(JSON.parse(raw));
  } catch {
    return { accounts: [], filter: null };
  }
}

/**
 * Signed-in accounts, and `filter`: the one account the Inbox and Spaces show,
 * or null for all of them.
 */
let state = load();
const listeners = new Set<() => void>();

function update(next: typeof state) {
  state = next;
  SecureStore.setItem(STORAGE_KEY, JSON.stringify(state));
  for (const listener of listeners) listener();
}

export function addStoredAccount(account: StoredAccount) {
  update({
    ...state,
    accounts: [
      ...state.accounts.filter((item) => item.address !== account.address),
      account,
    ],
  });
}

export function removeStoredAccount(address: string) {
  update({
    accounts: state.accounts.filter((item) => item.address !== address),
    filter: state.filter === address ? null : state.filter,
  });
}

export function setAccountFilter(address: string | null) {
  update({ ...state, filter: address });
}

/** The stored accounts, read outside React. */
export function storedAccounts() {
  return state.accounts;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStoredAccounts() {
  return useSyncExternalStore(subscribe, () => state);
}

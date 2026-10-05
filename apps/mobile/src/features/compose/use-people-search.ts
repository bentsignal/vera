import { useRef, useState } from "react";

import { useAccount } from "~/features/messaging/account";
import { useInbox } from "~/features/messaging/conversations";
import { toAddress } from "~/features/messaging/directory";
import { useProfiles } from "~/features/messaging/profiles";

const LOOKUP_DELAY_MS = 400;

/**
 * People to message or add: everyone from the account's conversations that
 * matches the search text, plus the account the text names once typing
 * pauses. `selected` people always stay in the results; `exclude` people
 * never appear.
 */
export function usePeopleSearch({
  selected = [],
  exclude = [],
}: {
  selected?: readonly string[];
  exclude?: readonly string[];
} = {}) {
  const { address: self } = useAccount();
  const { conversations } = useInbox({ account: self });
  const [query, setQueryNow] = useState("");
  // Account lookups wait for typing to pause.
  const [lookup, setLookup] = useState("");
  const lookupTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Remounting clears the native field.
  const [fieldKey, setFieldKey] = useState(0);
  const known = [
    ...new Set((conversations ?? []).flatMap((item) => item.memberIds)),
  ].filter((address) => address !== self && !exclude.includes(address));
  const typed = toAddress(lookup);
  const profileOf = useProfiles([
    ...known,
    ...selected,
    ...(typed === null ? [] : [typed]),
  ]);

  function setQuery(value: string) {
    setQueryNow(value);
    clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(() => setLookup(value), LOOKUP_DELAY_MS);
  }

  function clear() {
    clearTimeout(lookupTimer.current);
    setQueryNow("");
    setLookup("");
    setFieldKey((key) => key + 1);
  }

  const needle = query.trim().toLowerCase();
  // Selected people added by address come first, then known people, in a
  // stable order so checking a row never moves it.
  const people = [
    ...selected.filter((address) => !known.includes(address)),
    ...known,
  ].filter(
    (address) =>
      selected.includes(address) ||
      address.includes(needle) ||
      profileOf(address).displayName.toLowerCase().includes(needle),
  );

  return {
    clear,
    fieldKey,
    /** The typed account when it isn't already listed. */
    newAddress:
      typed !== null &&
      typed !== self &&
      !exclude.includes(typed) &&
      !people.includes(typed)
        ? typed
        : null,
    people,
    profileOf,
    setQuery,
  };
}

export type PeopleSearch = ReturnType<typeof usePeopleSearch>;

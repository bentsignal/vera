import { pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { useAccount } from "~/features/messaging/account";
import { useInbox } from "~/features/messaging/conversations";
import { toAddress } from "~/features/messaging/directory";
import { useProfiles } from "~/features/messaging/profiles";
import { pdsResultOr } from "~/features/messaging/results";
import { normalizeSearch } from "~/features/search/debounce";
import {
  useSearchQuery,
  useSearchText,
} from "~/features/search/use-search-query";

/**
 * The account a search names, such as `maya` or `maya@vera.chat`, when it
 * isn't `listed` already and exists. `query` is the search whose answer is
 * showing; it stays on the last one while the next is looked up.
 */
function useNamedAccount({
  listed,
  query,
  self,
}: {
  listed: ReadonlySet<string>;
  query: string;
  self: string;
}) {
  function lookupOf(text: string) {
    const address = toAddress(text);
    return address === null || address === self || listed.has(address)
      ? null
      : address;
  }
  const lookup = useSearchQuery({
    options: pdsQuery({
      args: { accountId: lookupOf(query) ?? "" },
      options: {
        enabled: lookupOf(query) !== null,
        // undefined until a PDS answers; false if none could.
        select: (result) =>
          pdsResultOr(result, [])?.some((profile) => profile !== null),
      },
      query: pds.accounts.getProfile,
      session: self,
    }),
    query,
  });
  return {
    address: lookup.data === true ? lookupOf(lookup.query) : null,
    query: lookup.query,
  };
}

/**
 * People to message or add: everyone from the account's conversations who
 * matches the search, plus the account the search names, once it is known
 * to exist. Results follow the debounced search and keep showing the last
 * answer while the next one loads. Without a search, `selected` people are
 * left out of the results (the picker lists them on their own); with one,
 * the ones who match are among the results. `exclude` people never appear.
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
  const text = useSearchText();
  const excluded = new Set(exclude);
  const picked = new Set(selected);
  const known = new Set(
    (conversations ?? [])
      .flatMap((item) => item.memberIds)
      .filter((address) => address !== self && !excluded.has(address)),
  );
  // Picked people can come from a lookup rather than a conversation; a
  // search finds them too.
  const candidates = new Set([...known, ...selected]);
  const listed = new Set([...candidates, ...excluded]);

  const lookup = useNamedAccount({ listed, query: text.query, self });
  // The query whose results are on screen.
  const needle = normalizeSearch(lookup.query);
  const searching = needle !== "";
  const newAddress = lookup.address;
  const profileOf = useProfiles([
    ...candidates,
    ...(newAddress === null ? [] : [newAddress]),
  ]);
  const people = searching
    ? [...candidates].filter(
        (address) =>
          address.includes(needle) ||
          profileOf(address).displayName.toLowerCase().includes(needle),
      )
    : [...known].filter((address) => !picked.has(address));

  return {
    clear: text.clear,
    /** The account the search names, when it exists and isn't listed. */
    newAddress,
    /** Nobody matches a non-empty search. */
    noResults: searching && people.length === 0 && newAddress === null,
    onChangeText: text.onChangeText,
    people,
    profileOf,
    /** A search is showing: picked people appear only if they match it. */
    searching,
  };
}

export type PeopleSearch = ReturnType<typeof usePeopleSearch>;

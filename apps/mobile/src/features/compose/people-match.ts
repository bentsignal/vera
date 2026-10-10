/** A full account address, such as `maya@vera.chat`. */
export const ADDRESS_PATTERN =
  /^[a-z0-9][a-z0-9._-]{1,31}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** Search text as typed into a people search: trimmed, lowercased, no `@` prefix. */
function normalize(text: string) {
  return text.trim().toLowerCase().replace(/^@/, "");
}

/**
 * The account a people search may name, to look up. A bare username, or
 * one followed by the start of the home domain (`maya`, `maya@`,
 * `maya@ve`), means that username on the home domain, so the person stays
 * found while the rest of the address is typed. Any other domain has to be
 * typed in full. Null when the text can't be an address.
 */
export function searchedAddress(text: string, homeDomain: string) {
  const value = normalize(text);
  const at = value.indexOf("@");
  const username = at === -1 ? value : value.slice(0, at);
  const domain = at === -1 ? "" : value.slice(at + 1);
  const address = homeDomain.startsWith(domain)
    ? `${username}@${homeDomain}`
    : value;
  return ADDRESS_PATTERN.test(address) ? address : null;
}

/**
 * Whether a person matches a people search: the text starts their address
 * (so `maya@`, `maya@ve` keep finding `maya@vera.chat`), or appears in
 * their username or display name. The domain alone doesn't match, or
 * typing `vera` would find everyone on `vera.chat`.
 */
export function matchesPerson(
  text: string,
  person: { address: string; displayName: string },
) {
  const needle = normalize(text);
  if (needle === "") return true;
  const address = person.address.toLowerCase();
  const username = address.slice(0, address.lastIndexOf("@"));
  return (
    address.startsWith(needle) ||
    username.includes(needle) ||
    person.displayName.toLowerCase().includes(needle)
  );
}

/**
 * What a people search shows, from one settled answer: the people listed
 * (from conversations, or picked) who match its query, and `found`, the
 * looked-up account its query names, if any. Both come from the same
 * query, so the rows change together, once per answer. Without a query,
 * everyone `known` who isn't `picked`.
 */
export function searchPeople({
  query,
  found,
  candidates,
  known,
  picked,
  displayNameOf,
}: {
  query: string;
  found: string | null;
  candidates: readonly string[];
  known: readonly string[];
  picked: ReadonlySet<string>;
  displayNameOf: (address: string) => string;
}) {
  const searching = normalize(query) !== "";
  const people = searching
    ? candidates.filter((address) =>
        matchesPerson(query, { address, displayName: displayNameOf(address) }),
      )
    : known.filter((address) => !picked.has(address));
  return {
    newAddress: found,
    noResults: searching && people.length === 0 && found === null,
    people,
    searching,
  };
}

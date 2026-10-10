import type { TextInputRef } from "@expo/ui";
import { useRef } from "react";
import { Platform } from "react-native";
import { FieldGroup, ListItem, Text } from "@expo/ui";

import type { PeopleSearch } from "./use-people-search";
import { Avatar } from "~/components/avatar";
import { TextInput } from "~/components/text-input";
import { secondaryTextStyle } from "~/lib/colors";
import { nestedListItemColors } from "~/lib/ui-modifiers";
import { CheckMark } from "./check-mark";
import { sectionGap } from "./people-layout";
import { PeopleSections } from "./people-sections";

/**
 * Android keeps both sections mounted and changes only their rows: Compose
 * crashes ("The specified child already has a parent") when a whole section
 * holding React Native views (the avatars) is removed and another inserted,
 * as when a search starts and the picked people hide. An empty section
 * draws nothing.
 */
const KEEP_SECTIONS = Platform.OS === "android";

function PersonRow({
  address,
  search,
  checked,
  onPress,
}: {
  address: string;
  search: PeopleSearch;
  /** Shows a check mark; leave undefined for a plain tappable row. */
  checked?: boolean;
  onPress: (address: string) => void;
}) {
  const { avatarUrl, displayName } = search.profileOf(address);
  return (
    <ListItem
      colors={nestedListItemColors}
      leading={<Avatar name={displayName} size="sm" uri={avatarUrl} />}
      supportingText={<Text textStyle={secondaryTextStyle}>{address}</Text>}
      trailing={
        // Compose reads a row's trailing slot only when the row mounts.
        // Android keeps an empty one on rows without a mark, so switching to
        // picking shows the marks without remounting every row.
        checked === undefined && Platform.OS !== "android" ? undefined : (
          <CheckMark checked={checked} onChange={() => onPress(address)} />
        )
      }
      onPress={() => onPress(address)}
    >
      {displayName}
    </ListItem>
  );
}

/** The people already picked, checked, shown while there's no search. */
function PickedSection({
  selected,
  search,
  onPress,
}: {
  selected: readonly string[];
  search: PeopleSearch;
  onPress: (address: string) => void;
}) {
  return (
    <FieldGroup.Section modifiers={selected.length > 0 ? sectionGap : []}>
      {selected.map((address) => (
        <PersonRow
          key={`selected:${address}`}
          address={address}
          search={search}
          checked
          onPress={onPress}
        />
      ))}
    </FieldGroup.Section>
  );
}

/** The people to pick from, or "No users found" when a search found none. */
function ResultsSection({
  results,
  search,
  checked,
  onPress,
}: {
  results: readonly string[];
  search: PeopleSearch;
  /** Whether a row shows checked; undefined for plain tappable rows. */
  checked?: (address: string) => boolean;
  onPress: (address: string) => void;
}) {
  if (!KEEP_SECTIONS && results.length === 0 && !search.noResults) return null;
  return (
    <FieldGroup.Section modifiers={sectionGap}>
      {search.noResults ? (
        <Text textStyle={secondaryTextStyle}>No users found</Text>
      ) : (
        results.map((address) => (
          <PersonRow
            key={address}
            address={address}
            search={search}
            checked={checked?.(address)}
            onPress={onPress}
          />
        ))
      )}
    </FieldGroup.Section>
  );
}

/**
 * A search field, then people to pick. With `selected`, rows show check
 * marks for picking several: without a search the people already picked
 * come first, in their own section, then everyone else; a search shows
 * only its matches, checked if they're picked, so the results stay right
 * under the field rather than below the picked list. Without `selected`,
 * tapping a row picks that person. Render inside a `FieldList`.
 *
 * Picking clears the field in place rather than remounting it: a remounted
 * field drops the keyboard and comes back, which flickers. Sections only
 * come and go below the field, for the same reason.
 */
export function PeoplePicker({
  search,
  selected,
  footer,
  onPress,
}: {
  search: PeopleSearch;
  selected?: readonly string[];
  /** A note under the search field. */
  footer?: string;
  onPress: (address: string) => void;
}) {
  const field = useRef<TextInputRef>(null);
  const picking = selected !== undefined;
  // The people picked show while there's no search.
  const showsPicked = picking && !search.searching && selected.length > 0;
  const picked = new Set(selected);
  const results = [
    ...(search.newAddress === null ? [] : [search.newAddress]),
    ...search.people,
  ];

  function pick(address: string) {
    const adding = picking && !picked.has(address);
    onPress(address);
    // Adding someone ends that search, as in Messages. Unchecking someone
    // leaves it, to pick another match.
    if (!adding) return;
    field.current?.clear();
    search.clear();
  }

  return (
    <>
      <FieldGroup.Section key="search">
        <TextInput
          ref={field}
          autoFocus
          placeholder="Search username or address"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          onChangeText={search.onChangeText}
        />
        {footer !== undefined && (
          <FieldGroup.SectionFooter>
            <Text>{footer}</Text>
          </FieldGroup.SectionFooter>
        )}
      </FieldGroup.Section>
      <PeopleSections key="people">
        {picking && (KEEP_SECTIONS || showsPicked) && (
          <PickedSection
            key="selected"
            selected={showsPicked ? selected : []}
            search={search}
            onPress={onPress}
          />
        )}
        <ResultsSection
          key="results"
          results={results}
          search={search}
          checked={picking ? (address) => picked.has(address) : undefined}
          onPress={pick}
        />
      </PeopleSections>
    </>
  );
}

import type { TextInputRef } from "@expo/ui";
import { useRef } from "react";
import { Platform } from "react-native";
import { FieldGroup, ListItem, Text, TextInput } from "@expo/ui";

import type { PeopleSearch } from "./use-people-search";
import { Avatar } from "~/components/avatar";
import { secondaryTextStyle } from "~/lib/colors";
import { nestedListItemColors } from "~/lib/ui-modifiers";
import { CheckMark } from "./check-mark";

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

/**
 * A search field, the people already picked, then the search results. With
 * `selected`, rows show check marks for picking several; without it,
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
  const results = [
    ...(search.newAddress === null ? [] : [search.newAddress]),
    ...search.people,
  ];

  function pick(address: string) {
    onPress(address);
    if (!picking) return;
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
      {picking && selected.length > 0 && (
        <FieldGroup.Section key="selected">
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
      )}
      {(results.length > 0 || search.noResults) && (
        <FieldGroup.Section key="results">
          {search.noResults ? (
            <Text textStyle={secondaryTextStyle}>No users found</Text>
          ) : (
            results.map((address) => (
              <PersonRow
                key={address}
                address={address}
                search={search}
                checked={picking ? false : undefined}
                onPress={pick}
              />
            ))
          )}
        </FieldGroup.Section>
      )}
    </>
  );
}

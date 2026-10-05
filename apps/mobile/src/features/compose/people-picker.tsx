import { FieldGroup, ListItem, Text, TextInput } from "@expo/ui";

import type { PeopleSearch } from "./use-people-search";
import { Avatar } from "~/components/avatar";
import { useAccountExists } from "~/features/messaging/directory";
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
        checked === undefined ? undefined : (
          <CheckMark checked={checked} onChange={() => onPress(address)} />
        )
      }
      onPress={() => onPress(address)}
    >
      {displayName}
    </ListItem>
  );
}

/** The account the search text names, or "No users found". */
function NewAddressSection({
  address,
  search,
  checked,
  onPress,
}: {
  address: string;
  search: PeopleSearch;
  checked?: boolean;
  onPress: (address: string) => void;
}) {
  const exists = useAccountExists(address);
  if (exists === undefined) return null;
  return (
    <FieldGroup.Section>
      {exists ? (
        <PersonRow
          address={address}
          search={search}
          checked={checked}
          onPress={onPress}
        />
      ) : (
        <Text textStyle={secondaryTextStyle}>No users found</Text>
      )}
    </FieldGroup.Section>
  );
}

/**
 * A search field over a list of people. With `selected`, rows show check
 * circles for picking several; without it, tapping a row picks that person.
 * Render inside a `FieldGroup`.
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
  const picked = new Set(selected);
  return (
    <>
      <FieldGroup.Section>
        <TextInput
          key={search.fieldKey}
          autoFocus
          placeholder="Search username or address"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          onChangeText={search.setQuery}
        />
        {footer !== undefined && (
          <FieldGroup.SectionFooter>
            <Text>{footer}</Text>
          </FieldGroup.SectionFooter>
        )}
      </FieldGroup.Section>
      {search.newAddress !== null && (
        <NewAddressSection
          address={search.newAddress}
          search={search}
          checked={selected === undefined ? undefined : false}
          onPress={onPress}
        />
      )}
      {search.people.length > 0 && (
        <FieldGroup.Section>
          {search.people.map((address) => (
            <PersonRow
              key={address}
              address={address}
              search={search}
              checked={selected === undefined ? undefined : picked.has(address)}
              onPress={onPress}
            />
          ))}
        </FieldGroup.Section>
      )}
    </>
  );
}

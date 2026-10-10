import { HStack, Image, Menu, Text, Toggle } from "@expo/ui/swift-ui";

export interface AccountChoice {
  address: string;
  name: string;
}

/**
 * The account at the trailing edge of a "From" row, opening a menu of the
 * signed-in accounts, each by name with its address under it and the
 * current one checked, like the Inbox's account menu. A menu scrolls, so
 * it holds any number of accounts. `account-menu.android.tsx` is the
 * Material dropdown.
 */
export function AccountMenu({
  value,
  accounts,
  onChange,
}: {
  value: string;
  accounts: readonly AccountChoice[];
  onChange: (address: string) => void;
}) {
  const current = accounts.find((account) => account.address === value);
  return (
    <Menu
      label={
        <HStack spacing={4}>
          <Text>{current?.name ?? value}</Text>
          <Image systemName="chevron.up.chevron.down" size={13} />
        </HStack>
      }
    >
      {accounts.map((account) => (
        <Toggle
          key={account.address}
          isOn={account.address === value}
          onIsOnChange={() => onChange(account.address)}
        >
          <Text>{account.name}</Text>
          <Text>{account.address}</Text>
        </Toggle>
      ))}
    </Menu>
  );
}

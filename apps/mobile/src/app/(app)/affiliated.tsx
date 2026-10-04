import { useLocalSearchParams } from "expo-router";

import { AccountScope } from "~/features/messaging/account";
import { AffiliatedSheet } from "~/features/profile/affiliated-sheet";

/** Explains the verified check, opened by tapping it on a profile. */
export default function AffiliatedScreen() {
  const { account, address } = useLocalSearchParams<{
    /** The signed-in account looking at the profile. */
    account?: string;
    address: string;
  }>();
  return (
    <AccountScope address={account}>
      <AffiliatedSheet address={address} />
    </AccountScope>
  );
}

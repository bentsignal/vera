import { Text, View } from "react-native";

import { useProfile } from "~/features/messaging/profiles";
import { AffiliatedBadge } from "./affiliated-badge";

function domainOf(address: string) {
  return address.slice(address.lastIndexOf("@") + 1);
}

/** What the check next to an account's name means. */
export function AffiliatedSheet({ address }: { address: string }) {
  const { displayName } = useProfile(address);
  const domain = domainOf(address);
  return (
    <View className="items-center gap-3 px-8 pt-10 pb-12">
      <AffiliatedBadge size={56} />
      <Text className="text-title text-foreground text-center font-bold">
        Verified Account
      </Text>
      <Text className="text-body text-foreground text-center">
        {`${displayName} is an official account of ${domain}, run by the people who operate it.`}
      </Text>
      <Text className="text-subhead text-muted text-center">
        {`Accounts without this check don't speak for ${domain}, even if their name says they do.`}
      </Text>
    </View>
  );
}

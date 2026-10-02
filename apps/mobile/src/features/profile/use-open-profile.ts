import { useRouter } from "expo-router";

import { useAccount } from "~/features/messaging/account";

/** Opens a person's profile as the account the current screen acts as. */
export function useOpenProfile() {
  const router = useRouter();
  const { address: account } = useAccount();
  return (address: string) =>
    router.push({
      params: { account, address },
      pathname: "/profile/[address]",
    });
}

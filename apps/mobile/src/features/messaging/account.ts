// eslint-disable-next-line no-restricted-imports -- Expo Router has no route loaders to preload suspense queries.
import { useQuery } from "@tanstack/react-query";

import { useSession } from "~/features/session/session-provider";

/** The signed-in account's address, such as `maya@vera.chat`. */
export function useAccount() {
  const { authClient } = useSession();
  const { data: address = "" } = useQuery({
    queryFn: () => authClient.getSession(),
    queryKey: ["vera", "session"],
    select: (session) => session.data?.user.email.toLowerCase(),
    staleTime: Infinity,
  });
  return {
    address,
    signOut: () => authClient.signOut(),
    username: address.slice(0, address.lastIndexOf("@")),
  };
}

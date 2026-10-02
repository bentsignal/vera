import { useQueries } from "@tanstack/react-query";
import { pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { useAccount } from "./account";
import { pdsResult } from "./results";

export function usernameOf(address: string) {
  return address.slice(0, address.lastIndexOf("@")) || address;
}

/**
 * Profiles by address, falling back to the username and no photo, and
 * whether every one has loaded (so screens can wait instead of flashing
 * usernames that then change to display names).
 */
export function useProfileState(addresses: readonly string[]) {
  const { address: session } = useAccount();
  const unique = [...new Set(addresses)];
  const profiles = useQueries({
    queries: unique.map((accountId) =>
      pdsQuery({
        args: { accountId },
        options: {
          // undefined while loading; null once known to have none.
          select: (result) => {
            const sources = pdsResult(result);
            return sources === undefined
              ? undefined
              : (sources.find((profile) => profile !== null) ?? null);
          },
        },
        query: pds.accounts.getProfile,
        session,
      }),
    ),
  });
  const found = new Map(
    unique.map((address, index) => [address, profiles[index]?.data]),
  );
  return {
    isLoading: profiles.some((profile) => profile.data === undefined),
    profileOf: (address: string) => {
      const profile = found.get(address);
      return {
        avatarUrl: profile?.avatarUrl ?? null,
        displayName: profile?.displayName ?? usernameOf(address),
      };
    },
  };
}

/** Profiles by address, falling back to the username and no photo. */
export function useProfiles(addresses: readonly string[]) {
  return useProfileState(addresses).profileOf;
}

/** Display names by address, falling back to the username. */
export function useDisplayNames(addresses: readonly string[]) {
  const profileOf = useProfiles(addresses);
  return (address: string) => profileOf(address).displayName;
}

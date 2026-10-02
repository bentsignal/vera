import { useQueries } from "@tanstack/react-query";
import { pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { pdsResult } from "./results";

export function usernameOf(address: string) {
  return address.slice(0, address.lastIndexOf("@")) || address;
}

/** Profiles by address, falling back to the username and no photo. */
export function useProfiles(addresses: readonly string[]) {
  const unique = [...new Set(addresses)];
  const profiles = useQueries({
    queries: unique.map((accountId) =>
      pdsQuery({
        args: { accountId },
        options: {
          select: (result) =>
            pdsResult(result)?.find((profile) => profile !== null),
        },
        query: pds.accounts.getProfile,
      }),
    ),
  });
  const found = new Map(
    unique.map((address, index) => [address, profiles[index]?.data]),
  );
  return (address: string) => {
    const profile = found.get(address);
    return {
      avatarUrl: profile?.avatarUrl ?? null,
      displayName: profile?.displayName ?? usernameOf(address),
    };
  };
}

/** Display names by address, falling back to the username. */
export function useDisplayNames(addresses: readonly string[]) {
  const profileOf = useProfiles(addresses);
  return (address: string) => profileOf(address).displayName;
}

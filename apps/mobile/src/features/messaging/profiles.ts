import { useQueries } from "@tanstack/react-query";
import { pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { pdsResult } from "./results";

export function usernameOf(address: string) {
  return address.slice(0, address.lastIndexOf("@")) || address;
}

/** Display names by address, falling back to the username. */
export function useDisplayNames(addresses: readonly string[]) {
  const unique = [...new Set(addresses)];
  const profiles = useQueries({
    queries: unique.map((accountId) =>
      pdsQuery({
        args: { accountId },
        options: {
          select: (result) =>
            pdsResult(result)?.find((profile) => profile !== null)?.displayName,
        },
        query: pds.accounts.getProfile,
      }),
    ),
  });
  const names = new Map(
    unique.map((address, index) => [
      address,
      profiles[index]?.data ?? usernameOf(address),
    ]),
  );
  return (address: string) => names.get(address) ?? usernameOf(address);
}

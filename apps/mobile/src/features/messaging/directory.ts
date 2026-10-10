import { useEffect } from "react";
// eslint-disable-next-line no-restricted-imports -- Expo Router has no route loaders to preload suspense queries.
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { pdsMutation, pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { useAccount, useAccounts } from "./account";
import { pdsResult } from "./results";

export function useMyProfile() {
  const { address } = useAccount();
  const { data } = useQuery(
    pdsQuery({
      args: {},
      options: {
        // undefined while loading; null once the PDS says there is none.
        select: (result) => {
          const sources = pdsResult(result);
          return sources === undefined
            ? undefined
            : (sources.find((profile) => profile !== null) ?? null);
        },
      },
      query: pds.accounts.getMyProfile,
      session: address,
    }),
  );
  const upsert = useMutation(
    pdsMutation({ mutation: pds.accounts.upsertMyProfile, session: address }),
  );
  return { profile: data, update: upsert.mutateAsync };
}

/**
 * Each signed-in account's display name, falling back to its username, for
 * telling the accounts apart in a list of them.
 */
export function useAccountNames() {
  const accounts = useAccounts();
  const names = useQueries({
    queries: accounts.map((account) =>
      pdsQuery({
        args: {},
        options: {
          select: (result) =>
            pdsResult(result)?.find((profile) => profile !== null)?.displayName,
        },
        query: pds.accounts.getMyProfile,
        session: account.address,
      }),
    ),
  });
  return accounts.map((account, index) => ({
    address: account.address,
    name: names[index]?.data ?? account.username,
  }));
}

/** Creates the account's profile the first time the app opens with it. */
export function useEnsureProfile() {
  const { username } = useAccount();
  const { profile, update } = useMyProfile();
  // eslint-disable-next-line no-restricted-syntax -- Accounts are created at sign-up without a profile; the server needs one before others can find the account.
  useEffect(() => {
    if (profile === null && username.length > 0) {
      void update({ avatarUrl: null, displayName: username });
    }
  }, [profile, update, username]);
}

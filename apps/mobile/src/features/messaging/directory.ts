import { useEffect } from "react";
// eslint-disable-next-line no-restricted-imports -- Expo Router has no route loaders to preload suspense queries.
import { useMutation, useQuery } from "@tanstack/react-query";
import { pdsMutation, pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { env } from "~/env";
import { useAccount } from "./account";
import { pdsResult } from "./results";

const ADDRESS_PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** Accepts `maya` or `maya@vera.chat` and returns a full address. */
export function toAddress(input: string) {
  const value = input.trim().toLowerCase().replace(/^@/, "");
  const address = value.includes("@") ? value : `${value}@${env.veraDomain}`;
  return ADDRESS_PATTERN.test(address) ? address : null;
}

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

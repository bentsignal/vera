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

/** Whether an address belongs to a Vera account, once known. */
export function useAccountExists(address: string | null) {
  const { data } = useQuery(
    pdsQuery({
      args: { accountId: address ?? "" },
      options: {
        enabled: address !== null,
        select: (result) =>
          pdsResult(result)?.some((profile) => profile !== null),
      },
      query: pds.accounts.getProfile,
    }),
  );
  return address === null ? undefined : data;
}

export function useMyProfile() {
  const { data } = useQuery(
    pdsQuery({
      args: {},
      options: {
        select: (result) =>
          pdsResult(result)?.find((profile) => profile !== null) ?? null,
      },
      query: pds.accounts.getMyProfile,
    }),
  );
  const upsert = useMutation(
    pdsMutation({ mutation: pds.accounts.upsertMyProfile }),
  );
  return { profile: data, update: upsert.mutateAsync };
}

/** Creates the signed-in account's profile the first time the app opens. */
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

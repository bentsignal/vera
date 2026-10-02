// eslint-disable-next-line no-restricted-imports -- Expo Router has no route loaders to preload suspense queries.
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { pdsMutation, pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { useAccount, useVisibleAccounts } from "./account";
import { pdsResult } from "./results";

/** Spaces across the visible accounts, each tagged with its account. */
export function useSpaces() {
  const accounts = useVisibleAccounts().map((account) => account.address);
  const results = useQueries({
    queries: accounts.map((session) =>
      pdsQuery({
        args: {},
        options: { select: pdsResult },
        query: pds.messages.spaces,
        session,
      }),
    ),
  });
  return {
    isLoading: results.every((result) => result.data === undefined),
    spaces: results.flatMap((result, index) =>
      (result.data ?? []).map((space) => ({
        ...space,
        account: accounts[index] ?? "",
        key: `${accounts[index] ?? ""} ${space.spaceId}`,
      })),
    ),
  };
}

export type AccountSpace = ReturnType<typeof useSpaces>["spaces"][number];

export function useSpace(spaceId: string) {
  const { address } = useAccount();
  const { data } = useQuery(
    pdsQuery({
      args: { spaceId },
      options: {
        // One home PDS answers; null means the space is not visible.
        select: (result) => pdsResult(result)?.[0],
      },
      query: pds.messages.space,
      session: address,
    }),
  );
  return { isLoading: data === undefined, space: data ?? undefined };
}

export function useSpaceActions() {
  const { address: session } = useAccount();
  return {
    addMembers: useMutation(
      pdsMutation({ mutation: pds.messages.addSpaceMembers, session }),
    ),
    createChannel: useMutation(
      pdsMutation({ mutation: pds.messages.createChannel, session }),
    ),
    createSpace: useMutation(
      pdsMutation({ mutation: pds.messages.createSpace, session }),
    ),
    removeMember: useMutation(
      pdsMutation({ mutation: pds.messages.removeSpaceMember, session }),
    ),
  };
}

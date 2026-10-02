// eslint-disable-next-line no-restricted-imports -- Expo Router has no route loaders to preload suspense queries.
import { useMutation, useQuery } from "@tanstack/react-query";
import { pdsMutation, pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { pdsResult } from "./results";

export function useSpaces() {
  const { data } = useQuery(
    pdsQuery({
      args: {},
      options: { select: pdsResult },
      query: pds.messages.spaces,
    }),
  );
  return { isLoading: data === undefined, spaces: data ?? [] };
}

export function useSpace(spaceId: string) {
  const { data } = useQuery(
    pdsQuery({
      args: { spaceId },
      options: {
        // One home PDS answers; null means the space is not visible.
        select: (result) => pdsResult(result)?.[0],
      },
      query: pds.messages.space,
    }),
  );
  return { isLoading: data === undefined, space: data ?? undefined };
}

export function useSpaceActions() {
  return {
    addMembers: useMutation(
      pdsMutation({ mutation: pds.messages.addSpaceMembers }),
    ),
    createChannel: useMutation(
      pdsMutation({ mutation: pds.messages.createChannel }),
    ),
    createSpace: useMutation(
      pdsMutation({ mutation: pds.messages.createSpace }),
    ),
    removeMember: useMutation(
      pdsMutation({ mutation: pds.messages.removeSpaceMember }),
    ),
  };
}

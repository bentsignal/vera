// eslint-disable-next-line no-restricted-imports -- Expo Router has no route loaders to preload suspense queries.
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { pdsMutation, pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { useAccount, useAccounts, useVisibleAccounts } from "./account";
import { pdsResult, pdsResultOr } from "./results";

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

/** Spaces the visible accounts are invited to, each tagged with its account. */
export function useSpaceInvites() {
  const accounts = useVisibleAccounts().map((account) => account.address);
  const results = useQueries({
    queries: accounts.map((session) =>
      pdsQuery({
        args: {},
        // A PDS without invitations has none to show.
        options: { select: (result) => pdsResultOr(result, []) },
        query: pds.messages.spaceInvites,
        session,
      }),
    ),
  });
  return {
    invites: results.flatMap((result, index) =>
      (result.data ?? []).map((invite) => ({
        ...invite,
        account: accounts[index] ?? "",
        key: `${accounts[index] ?? ""} ${invite.spaceId}`,
      })),
    ),
    isLoading: results.every((result) => result.data === undefined),
  };
}

export type AccountSpaceInvite = ReturnType<
  typeof useSpaceInvites
>["invites"][number];

/** A space's invite links that the account may see and turn off. */
export function useSpaceInviteLinks(spaceId: string) {
  const { address } = useAccount();
  const { data } = useQuery(
    pdsQuery({
      args: { spaceId },
      options: { select: (result) => pdsResultOr(result, []) },
      query: pds.messages.spaceInviteLinks,
      session: address,
    }),
  );
  return { isLoading: data === undefined, links: data ?? [] };
}

/**
 * Where an invite link leads, for each signed-in account that can open it
 * (its home PDS knows the code). Loading until every account has answered.
 */
export function useInviteLinkPreview(code: string) {
  const accounts = useAccounts().map((account) => account.address);
  const results = useQueries({
    queries: accounts.map((session) =>
      pdsQuery({
        args: { code },
        options: {
          // undefined while loading; null when this account can't open it.
          select: (result) => {
            const found = pdsResultOr(result, [null]);
            return found === undefined ? undefined : (found[0] ?? null);
          },
        },
        query: pds.messages.spaceInviteLinkPreview,
        session,
      }),
    ),
  });
  return {
    isLoading: results.some((result) => result.data === undefined),
    previews: results.flatMap((result, index) =>
      result.data == null
        ? []
        : [{ ...result.data, account: accounts[index] ?? "" }],
    ),
  };
}

export function useSpaceActions() {
  const { address: session } = useAccount();
  return {
    acceptInvite: useMutation(
      pdsMutation({ mutation: pds.messages.acceptSpaceInvite, session }),
    ),
    createChannel: useMutation(
      pdsMutation({ mutation: pds.messages.createChannel, session }),
    ),
    createInviteLink: useMutation(
      pdsMutation({ mutation: pds.messages.createSpaceInviteLink, session }),
    ),
    createSpace: useMutation(
      pdsMutation({ mutation: pds.messages.createSpace, session }),
    ),
    declineInvite: useMutation(
      pdsMutation({ mutation: pds.messages.declineSpaceInvite, session }),
    ),
    invite: useMutation(
      pdsMutation({ mutation: pds.messages.inviteToSpace, session }),
    ),
    joinWithLink: useMutation(
      pdsMutation({ mutation: pds.messages.joinSpaceWithLink, session }),
    ),
    removeMember: useMutation(
      pdsMutation({ mutation: pds.messages.removeSpaceMember, session }),
    ),
    revokeInviteLink: useMutation(
      pdsMutation({ mutation: pds.messages.revokeSpaceInviteLink, session }),
    ),
  };
}

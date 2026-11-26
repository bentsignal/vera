import type { Space } from "@decentralized-convex/messages";
import { useState } from "react";
/* eslint-disable no-restricted-imports -- Expo Router has no route loaders to preload suspense queries. */
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
/* eslint-enable no-restricted-imports */
import { pdsMutation, pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { useAccount, useAccounts, useVisibleAccounts } from "./account";
import { cachedSelect, chainAfter, morePages } from "./cached";
import * as optimistic from "./optimistic";
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

/** How many of something a space has: "50+" when only some are loaded. */
export function memberCount(loaded: number, more: boolean) {
  return more ? `${loaded}+` : String(loaded);
}

/**
 * The query for the page of a space's members after `after` (the page
 * before's last).
 */
function memberPageQuery(session: string, spaceId: string, after: string) {
  return pdsQuery({
    args: { after, spaceId },
    options: { select: (result) => pdsResultOr(result, null)?.[0] ?? null },
    query: pds.messages.spaceMembers,
    session,
  });
}

/**
 * The query for the page of a space's channels after the position
 * `after`.
 */
function channelPageQuery(session: string, spaceId: string, after: number) {
  return pdsQuery({
    args: { after, spaceId },
    options: { select: (result) => pdsResultOr(result, null)?.[0] ?? null },
    query: pds.messages.spaceChannels,
    session,
  });
}

/**
 * A space's members: the first page `space` lists, then `loadMore` asks
 * for each next one.
 */
export function useSpaceMembers(space: Space | undefined) {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const [count, setCount] = useState(0);
  const start =
    space?.moreMembers === true ? space.members.at(-1)?.accountId : undefined;
  const chain = chainAfter({
    count,
    nextOf: (query) => cachedSelect(queryClient, query)?.next,
    queryFor: (after: string) =>
      memberPageQuery(address, space?.spaceId ?? "", after),
    start,
  });
  const results = useQueries({ queries: chain });
  const hasMore = morePages(start, results.at(-1));
  return {
    hasMore,
    loadMore: () => {
      if (hasMore && results.at(-1)?.isFetching !== true) {
        setCount(chain.length + 1);
      }
    },
    members: [
      ...(space?.members ?? []),
      ...results.flatMap((result) => result.data?.members ?? []),
    ],
  };
}

/**
 * A space's channels: the first page `space` lists, then `loadMore` asks
 * for each next one.
 */
export function useSpaceChannels(space: Space | undefined) {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const [count, setCount] = useState(0);
  const start =
    space?.moreChannels === true ? space.channels.at(-1)?.position : undefined;
  const chain = chainAfter({
    count,
    nextOf: (query) => cachedSelect(queryClient, query)?.next,
    queryFor: (after: number) =>
      channelPageQuery(address, space?.spaceId ?? "", after),
    start,
  });
  const results = useQueries({ queries: chain });
  const hasMore = morePages(start, results.at(-1));
  const first = space?.channels ?? [];
  const seen = new Set(first.map((channel) => channel.conversationId));
  return {
    // A page starts after the last position, so ties can repeat.
    channels: [
      ...first,
      ...results
        .flatMap((result) => result.data?.channels ?? [])
        .filter((channel) => !seen.has(channel.conversationId)),
    ],
    hasMore,
    loadMore: () => {
      if (hasMore && results.at(-1)?.isFetching !== true) {
        setCount(chain.length + 1);
      }
    },
  };
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
  // A preview cached from an earlier look can be out of date (the link
  // deleted, or the account removed from its space since), so it waits
  // for one the PDS sent after the sheet opened.
  const [openedAt] = useState(() => Date.now());
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
    isLoading: results.some(
      (result) => result.data === undefined || result.dataUpdatedAt < openedAt,
    ),
    previews: results.flatMap((result, index) =>
      result.data == null
        ? []
        : [{ ...result.data, account: accounts[index] ?? "" }],
    ),
  };
}

/**
 * Space actions as the scoped account. Creating, joining, inviting, and
 * leaving show their result right away, before the PDS answers.
 */
export function useSpaceActions() {
  const { address: session } = useAccount();
  return {
    acceptInvite: useMutation(
      pdsMutation({
        mutation: pds.messages.acceptSpaceInvite,
        optimisticUpdate: optimistic.joinSpace,
        session,
      }),
    ),
    createChannel: useMutation(
      pdsMutation({
        mutation: pds.messages.createChannel,
        optimisticUpdate: optimistic.createChannel(session),
        session,
      }),
    ),
    createInviteLink: useMutation(
      pdsMutation({ mutation: pds.messages.createSpaceInviteLink, session }),
    ),
    createSpace: useMutation(
      pdsMutation({
        mutation: pds.messages.createSpace,
        optimisticUpdate: optimistic.createSpace(session),
        session,
      }),
    ),
    declineInvite: useMutation(
      pdsMutation({
        mutation: pds.messages.declineSpaceInvite,
        optimisticUpdate: optimistic.declineInvite,
        session,
      }),
    ),
    invite: useMutation(
      pdsMutation({
        mutation: pds.messages.inviteToSpace,
        optimisticUpdate: optimistic.inviteToSpace,
        session,
      }),
    ),
    joinWithLink: useMutation(
      pdsMutation({
        mutation: pds.messages.joinSpaceWithLink,
        optimisticUpdate: optimistic.joinSpaceWithLink,
        session,
      }),
    ),
    removeMember: useMutation(
      pdsMutation({
        mutation: pds.messages.removeSpaceMember,
        optimisticUpdate: optimistic.removeSpaceMember(session),
        session,
      }),
    ),
    revokeInviteLink: useMutation(
      pdsMutation({ mutation: pds.messages.revokeSpaceInviteLink, session }),
    ),
    setInviteLinkExpiry: useMutation(
      pdsMutation({ mutation: pds.messages.setSpaceInviteLinkExpiry, session }),
    ),
  };
}

import type { Space } from "@decentralized-convex/messages";
import type { PdsOptimisticLocalStore } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

// A space as the cache holds it: its own query, the spaces list, and the
// pages of members loaded after the first.

type Store = PdsOptimisticLocalStore;

/** Changes a space wherever it's loaded: on its own and in lists. */
export function updateSpace(
  store: Store,
  spaceId: string,
  change: (space: Space) => Space,
) {
  const request = pds.messages.space({ spaceId });
  const space = store.getQuery(request);
  if (space != null) store.setQuery(request, change(space));
  for (const { request: list, value } of store.getAllQueries(
    pds.messages.spaces,
  )) {
    if (value === undefined) continue;
    store.setQuery(
      list,
      value.map((item) => (item.spaceId === spaceId ? change(item) : item)),
    );
  }
}

/**
 * Takes someone out of a space's member pages loaded after the first
 * (`useSpaceMembers`), as `space` drops them from its first page.
 */
export function dropFromMemberPages(
  store: Store,
  spaceId: string,
  accountId: string,
) {
  for (const { args, request, value } of store.getAllQueries(
    pds.messages.spaceMembers,
  )) {
    if (value == null || args.spaceId !== spaceId) continue;
    store.setQuery(request, {
      ...value,
      members: value.members.filter((member) => member.accountId !== accountId),
    });
  }
}

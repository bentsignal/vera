import { useQueries } from "@tanstack/react-query";
import { pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { useVisibleAccounts } from "~/features/messaging/account";
import { useInboxes } from "~/features/messaging/inbox-rows";
import { pdsResultOr } from "~/features/messaging/results";
import { usePreference } from "~/features/preferences/store";
import { homeCount } from "./home-count";

/**
 * What Home's badge counts, for each of these accounts: its Inbox (null
 * if its PDS failed), and the threads it's in while the Inbox lists them.
 * The same queries as the Inbox's (its list and rows), so they share its
 * data.
 */
export function useHomeQueries(accounts: readonly string[]) {
  const kinds = usePreference("inboxIncludes");
  const threadsShown = kinds.includes("threads");
  const inboxes = useInboxes(accounts);
  const threads = useQueries({
    queries: accounts.map((session) =>
      pdsQuery({
        args: {},
        // A server without thread lists (an older one) has none to count.
        options: {
          enabled: threadsShown,
          select: (result) => pdsResultOr(result, []),
        },
        query: pds.messages.inboxThreads,
        session,
      }),
    ),
  });
  const loaded =
    inboxes.every((result) => result.data !== undefined && result.complete) &&
    (!threadsShown || threads.every((result) => result.data !== undefined));
  return {
    count: homeCount({
      conversations: inboxes.flatMap((result) => result.data ?? []),
      kinds,
      threads: threadsShown
        ? threads.flatMap((result) => result.data ?? [])
        : [],
    }),
    inboxes,
    kinds,
    loaded,
    threads,
  };
}

/**
 * Home's badge across the visible accounts: the Inbox rows it lists with
 * something unread (see `homeCount`), so it follows what the Inbox shows.
 */
export function useHomeBadge() {
  const accounts = useVisibleAccounts().map(({ address }) => address);
  return useHomeQueries(accounts).count;
}

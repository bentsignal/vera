// eslint-disable-next-line no-restricted-imports -- Expo Router has no route loaders to preload suspense queries.
import { useQueries, useQuery } from "@tanstack/react-query";
import { pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { domainOf } from "~/features/compose/people-match";
import { verified } from "~/features/profile/verified";
import { useAccount, useAccounts } from "./account";
import { pdsResult, pdsResultOr } from "./results";

export function usernameOf(address: string) {
  return address.slice(0, address.lastIndexOf("@")) || address;
}

/**
 * Each profile as screens show it, the same object while the profile is,
 * so rows that show it (every message in a conversation) don't redraw.
 */
const shownProfiles = new WeakMap<object, ShownProfile>();
const fallbacks = new Map<string, ShownProfile>();

interface ShownProfile {
  readonly affiliated: boolean;
  readonly avatarUrl: string | null;
  readonly displayName: string;
}

function shownProfile(
  address: string,
  profile:
    | {
        readonly affiliated?: boolean;
        readonly avatarUrl?: string | null;
        readonly displayName?: string;
      }
    | null
    | undefined,
) {
  if (profile == null) {
    const fallback = fallbacks.get(address) ?? {
      affiliated: false,
      avatarUrl: null,
      displayName: usernameOf(address),
    };
    fallbacks.set(address, fallback);
    return fallback;
  }
  const shown = shownProfiles.get(profile) ?? {
    affiliated: verified(address, profile.affiliated),
    avatarUrl: profile.avatarUrl ?? null,
    displayName: profile.displayName ?? usernameOf(address),
  };
  shownProfiles.set(profile, shown);
  return shown;
}

/**
 * Which signed-in account asks for a profile: one on the same server, which
 * keeps it, or else the account in use (its server asks the home server).
 * Every screen asks the same way, so they share what's already loaded: the
 * Inbox's rows and the conversation opened from one, whichever account the
 * Inbox shows it under.
 */
function useProfileSession() {
  const { address: self } = useAccount();
  const accounts = useAccounts();
  return (address: string) =>
    accounts.find((account) => domainOf(account.address) === domainOf(address))
      ?.address ?? self;
}

/**
 * Profiles by address, falling back to the username and no photo, and
 * whether every one has loaded (so screens can wait instead of flashing
 * usernames that then change to display names).
 */
export function useProfileState(addresses: readonly string[]) {
  const sessionFor = useProfileSession();
  const unique = [...new Set(addresses)];
  // Shared structurally with the last result, so the same profiles give the
  // same object, and `profileOf` stays the same function: rows that take it
  // (every message in a conversation) don't redraw when nothing changed.
  const { found, isLoading } = useQueries({
    queries: unique.map((accountId) =>
      pdsQuery({
        args: { accountId },
        options: {
          // undefined while loading; null once known to have none, or once
          // their PDS fails, so screens waiting on profiles don't wait on
          // it forever.
          select: (result) => {
            const sources = pdsResultOr(result, []);
            return sources === undefined
              ? undefined
              : (sources.find((profile) => profile !== null) ?? null);
          },
        },
        query: pds.accounts.getProfile,
        session: sessionFor(accountId),
      }),
    ),
    combine: (results) => ({
      found: Object.fromEntries(
        unique.map((address, index) => [address, results[index]?.data]),
      ),
      isLoading: results.some((result) => result.data === undefined),
    }),
  });
  return {
    isLoading,
    /** Whether this address's profile (or its absence) is known. */
    isLoaded: (address: string) => found[address] !== undefined,
    profileOf: (address: string) => shownProfile(address, found[address]),
  };
}

/** Profiles by address, falling back to the username and no photo. */
export function useProfiles(addresses: readonly string[]) {
  return useProfileState(addresses).profileOf;
}

/** Display names by address, falling back to the username. */
export function useDisplayNames(addresses: readonly string[]) {
  const profileOf = useProfiles(addresses);
  return (address: string) => profileOf(address).displayName;
}

/**
 * One person's profile, falling back to the username and no photo.
 * `isLoading` holds until their PDS answers, so screens can fade it in.
 */
export function useProfile(address: string) {
  const session = useProfileSession()(address);
  const { data } = useQuery(
    pdsQuery({
      args: { accountId: address },
      options: {
        // undefined while loading; null once the PDS says there is none.
        select: (result) => {
          const sources = pdsResult(result);
          return sources === undefined
            ? undefined
            : (sources.find((profile) => profile !== null) ?? null);
        },
      },
      query: pds.accounts.getProfile,
      session,
    }),
  );
  return {
    affiliated: verified(address, data?.affiliated),
    avatarUrl: data?.avatarUrl ?? null,
    displayName: data?.displayName ?? usernameOf(address),
    isLoading: data === undefined,
  };
}

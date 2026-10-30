import type {
  Contact,
  MessagePermission,
  MessagesFrom,
} from "@decentralized-convex/messages";
import type { PdsOptimisticLocalStore } from "@decentralized-convex/tanstack-query";
// eslint-disable-next-line no-restricted-imports -- Expo Router has no route loaders to preload suspense queries.
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { pdsMutation, pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { useAccount, useAccounts } from "~/features/messaging/account";
import { startTime } from "~/features/messaging/optimistic";
import { pdsResultOr } from "~/features/messaging/results";

// Contacts: the people each account added, with its own name and photo for
// them, and who can message it (see `.plans/contacts.md`).

const NO_CONTACTS = Object.freeze<Contact[]>([]);

function contactsQuery(session: string) {
  return pdsQuery({
    args: {},
    options: {
      // undefined while loading; empty once known, or from a server
      // without contacts.
      select: (result) => pdsResultOr(result, NO_CONTACTS),
    },
    query: pds.messages.contacts,
    session,
  });
}

/** The account in use's contacts, the most recently added first. */
export function useContacts() {
  const { address } = useAccount();
  const { data } = useQuery(
    pdsQuery({
      args: {},
      options: { select: (result) => pdsResultOr(result, NO_CONTACTS) },
      query: pds.messages.contacts,
      session: address,
    }),
  );
  return data;
}

/**
 * The account in use's contact for someone: undefined while loading, null
 * when they aren't one.
 */
export function useContact(address: string) {
  const contacts = useContacts();
  const accountId = address.trim().toLowerCase();
  return contacts === undefined
    ? undefined
    : (contacts.find((contact) => contact.accountId === accountId) ?? null);
}

/**
 * Who a person is in your contacts: the account in use's contact first,
 * then another signed-in account's, since they're all yours. Undefined
 * for someone in none of them.
 */
export function useContactBook() {
  const { address: self } = useAccount();
  const accounts = useAccounts();
  const sessions = [
    self,
    ...accounts
      .map((account) => account.address)
      .filter((address) => address !== self),
  ];
  return useQueries({
    queries: sessions.map(contactsQuery),
    combine: (results) => {
      const found = new Map<string, Contact>();
      for (const result of results) {
        for (const contact of result.data ?? NO_CONTACTS) {
          if (!found.has(contact.accountId)) {
            found.set(contact.accountId, contact);
          }
        }
      }
      return (address: string) => found.get(address);
    },
  });
}

type ContactChange = Parameters<typeof pds.messages.saveContact>[0];

/** The contact as saved: a change on top of what's there, or a new one. */
function savedContact(existing: Contact | undefined, change: ContactChange) {
  const { accountId, avatarUrl, name } = change;
  const next = existing ?? {
    accountId: accountId.trim().toLowerCase(),
    addedAt: startTime(change),
  };
  const trimmed = name?.trim();
  return {
    ...next,
    ...(avatarUrl === undefined ? {} : { avatarUrl: avatarUrl ?? undefined }),
    ...(name === undefined
      ? {}
      : { name: trimmed === "" ? undefined : trimmed }),
  } satisfies Contact;
}

function showSaved(store: PdsOptimisticLocalStore, change: ContactChange) {
  const request = pds.messages.contacts({});
  const current = store.getQuery(request);
  if (current == null) return;
  const accountId = change.accountId.trim().toLowerCase();
  const existing = current.find((contact) => contact.accountId === accountId);
  const saved = savedContact(existing, change);
  store.setQuery(
    request,
    existing === undefined
      ? [saved, ...current]
      : current.map((contact) => (contact === existing ? saved : contact)),
  );
}

function showRemoved(
  store: PdsOptimisticLocalStore,
  { accountId }: { accountId: string },
) {
  const request = pds.messages.contacts({});
  const current = store.getQuery(request);
  if (current == null) return;
  const removed = accountId.trim().toLowerCase();
  store.setQuery(
    request,
    current.filter((contact) => contact.accountId !== removed),
  );
}

/** Adding, changing, and removing the account in use's contacts. */
export function useContactActions() {
  const { address: session } = useAccount();
  return {
    remove: useMutation(
      pdsMutation({
        mutation: pds.messages.removeContact,
        optimisticUpdate: showRemoved,
        session,
      }),
    ),
    save: useMutation(
      pdsMutation({
        mutation: pds.messages.saveContact,
        optimisticUpdate: showSaved,
        session,
      }),
    ),
  };
}

/** Who can message the account in use; undefined while loading. */
export function usePrivacySettings() {
  const { address: session } = useAccount();
  const { data } = useQuery(
    pdsQuery({
      args: {},
      options: {
        // null from a server without the setting.
        select: (result) => {
          const answer = pdsResultOr(result, null);
          return answer === undefined ? undefined : (answer?.[0] ?? null);
        },
      },
      query: pds.messages.privacySettings,
      session,
    }),
  );
  const set = useMutation(
    pdsMutation({
      mutation: pds.messages.setPrivacySettings,
      optimisticUpdate: (store, change) => {
        const request = pds.messages.privacySettings({});
        const current = store.getQuery(request);
        if (current != null) store.setQuery(request, { ...current, ...change });
      },
      session,
    }),
  );
  return {
    messagesFrom: data === null ? null : data?.messagesFrom,
    setMessagesFrom: (messagesFrom: MessagesFrom) =>
      set.mutateAsync({ messagesFrom }),
  };
}

const ANYONE = { direct: true, groups: true } satisfies MessagePermission;

/** Each PDS's answer together: any saying no wins. */
function permissionOf(sources: readonly MessagePermission[]) {
  return {
    direct: sources.every((source) => source.direct),
    groups: sources.every((source) => source.groups),
  } satisfies MessagePermission;
}

/**
 * Whether the account in use can message each person, by their choice of
 * who can message them: allowed until their PDS says otherwise, and by
 * servers without the setting.
 */
export function useMessagePermissions(addresses: readonly string[]) {
  const { address: session } = useAccount();
  const unique = [...new Set(addresses)];
  return useQueries({
    queries: unique.map((accountId) =>
      pdsQuery({
        args: { accountId },
        options: {
          select: (result) => {
            const sources = pdsResultOr(result, []);
            return sources === undefined ? undefined : permissionOf(sources);
          },
        },
        query: pds.messages.messagePermission,
        session,
      }),
    ),
    combine: (results) => {
      const found = new Map(
        unique.map((address, index) => [address, results[index]?.data]),
      );
      return (address: string) => found.get(address) ?? ANYONE;
    },
  });
}

/** Whether the account in use can message one person; undefined until known. */
export function useMessagePermission(address: string) {
  const { address: session } = useAccount();
  const { data } = useQuery(
    pdsQuery({
      args: { accountId: address },
      options: {
        select: (result) => {
          const sources = pdsResultOr(result, []);
          return sources === undefined ? undefined : permissionOf(sources);
        },
      },
      query: pds.messages.messagePermission,
      session,
    }),
  );
  return data;
}

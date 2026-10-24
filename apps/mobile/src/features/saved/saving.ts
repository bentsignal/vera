import type {
  Conversation,
  Message as PdsMessage,
} from "@decentralized-convex/messages";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { AppState } from "react-native";
import { pdsQuery, pdsQueryKey } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import type { Saved, SavedEntry } from "./saved-files";
import { inboxQuery, rowProfiles } from "~/features/messaging/inbox";
import {
  latestOpenedAt,
  latestPageParts,
  latestPageQueries,
} from "~/features/messaging/message-window";
import {
  chunks,
  reactionsQuery,
  reactionsSinceQuery,
} from "~/features/messaging/reactions";
import { pdsResult, pdsResultOr } from "~/features/messaging/results";
import {
  summariesQuery,
  summariesSinceQuery,
} from "~/features/messaging/threads";
import {
  onAccountSession,
  queryClient,
} from "~/features/session/account-session";
import { fieldOf } from "./fields";
import { recentConversations } from "./recent";
import { cachedVersion, refreshSaved } from "./refresh-saved";
import { liveResult, liveSelected } from "./saved-cache";
import {
  conversationFile,
  deleteSaved,
  forgetSaved,
  inboxFile,
  savedConversationIds,
  writeSaved,
  writeVersions,
} from "./saved-files";
import { watchAnswers } from "./unanswered";

interface Account {
  readonly address: string;
  readonly storagePrefix: string;
}

/** A conversation, as its screen asks for it (`useConversation`). */
function conversationQuery(session: string, conversationId: string) {
  return pdsQuery({
    args: { conversationId },
    options: { select: (result) => pdsResult(result)?.[0] },
    query: pds.messages.conversation,
    session,
  });
}

/** A group's joins and leaves, as its screen asks (`useMemberNotices`). */
function memberEventsQuery(session: string, conversationId: string) {
  return pdsQuery({
    args: { conversationId },
    options: { select: (result) => pdsResultOr(result, []) },
    query: pds.messages.memberEvents,
    session,
  });
}

function entryOf(queryClient: QueryClient, key: QueryKey) {
  const live = liveResult(
    queryClient.getQueryCache().find({ exact: true, queryKey: key }),
  );
  return live === undefined
    ? undefined
    : ({ key, result: live.result } satisfies SavedEntry);
}

/** Whose profile a query asks for, if it asks for one. */
function profileOf(key: QueryKey) {
  const request = key[5];
  const operation = fieldOf(request, "operation");
  if (
    fieldOf(request, "plugin") !== "accounts" ||
    fieldOf(operation, "type") !== "getProfile"
  ) {
    return undefined;
  }
  const accountId = fieldOf(fieldOf(operation, "args"), "accountId");
  return typeof accountId === "string" ? accountId : undefined;
}

/** Every live profile in the cache, by address, under any account. */
function liveProfiles(queryClient: QueryClient) {
  const profiles = new Map<string, SavedEntry>();
  for (const { queryKey } of queryClient.getQueryCache().getAll()) {
    const accountId = profileOf(queryKey);
    const entry =
      accountId === undefined ? undefined : entryOf(queryClient, queryKey);
    if (accountId !== undefined && entry !== undefined) {
      profiles.set(accountId, entry);
    }
  }
  return profiles;
}

/** Each entry, or undefined if any is missing. */
function complete<Entry>(entries: readonly (Entry | undefined)[]) {
  const found = entries.filter((entry) => entry !== undefined);
  return found.length === entries.length ? found : undefined;
}

/**
 * The Inbox and Spaces as Home shows them, and the account's most recent
 * conversations, or undefined until the Inbox and its rows' names are live.
 */
function inboxSaved(
  queryClient: QueryClient,
  address: string,
  profiles: ReadonlyMap<string, SavedEntry>,
) {
  const inbox = inboxQuery(address);
  const conversations = liveSelected(queryClient, inbox);
  if (conversations === undefined) return undefined;
  const people = new Set(
    conversations.flatMap((conversation) => rowProfiles(address, conversation)),
  );
  const rows = complete([...people].map((person) => profiles.get(person)));
  const main = entryOf(queryClient, inbox.queryKey);
  if (rows === undefined || main === undefined) return undefined;
  // Home's other lists, when they've loaded.
  const extras = [
    pdsQueryKey(pds.messages.spaces({}), address),
    pdsQueryKey(pds.messages.inboxThreads({}), address),
  ].flatMap((key) => entryOf(queryClient, key) ?? []);
  return {
    recent: recentConversations(conversations),
    saved: {
      entries: [main, ...extras, ...rows],
      savedAt: Date.now(),
    } satisfies Saved,
  };
}

/**
 * The queries the latest messages' pages show with, as the window opened
 * at `openedAt` asks for them (see `windowParts`): their reactions and
 * threads, a group's joins and leaves, and who they show.
 */
function pageParts(
  queryClient: QueryClient,
  address: string,
  conversation: Conversation,
  window: {
    openedAt: number;
    pages: readonly { messages: readonly PdsMessage[] }[];
  },
) {
  const { openedAt, pages } = window;
  const { conversationId, kind, members } = conversation;
  const parts = latestPageParts(
    openedAt,
    pages.map(({ messages }) => ({
      hasNewer: false,
      hasOlder: false,
      messages,
    })),
  );
  const reactions = [
    ...parts.messageIds
      .flatMap(chunks)
      .map((ids) => reactionsQuery(address, conversationId, ids).queryKey),
    reactionsSinceQuery(address, conversationId, openedAt).queryKey,
  ];
  const summaries = [
    ...parts.threadIds
      .flatMap(chunks)
      .map((ids) => summariesQuery(address, conversationId, ids)),
    summariesSinceQuery(address, conversationId, openedAt),
  ];
  const repliers = summaries.flatMap((query) =>
    (liveSelected(queryClient, query) ?? []).flatMap(
      ({ repliers }) => repliers,
    ),
  );
  const events = memberEventsQuery(address, conversationId);
  const keys = [
    ...reactions,
    ...summaries.map(({ queryKey }) => queryKey),
    ...(kind === "group" ? [events.queryKey] : []),
  ];
  const people = [
    ...(kind === "channel" ? [] : members),
    ...pages.flatMap(({ messages }) =>
      messages.flatMap(({ authorId, quote }) => [
        authorId,
        ...(quote === undefined ? [] : [quote.authorId]),
      ]),
    ),
    ...repliers,
    ...(kind === "group"
      ? (liveSelected(queryClient, events) ?? []).map(
          ({ accountId }) => accountId,
        )
      : []),
  ];
  return { keys, people: new Set(people) };
}

/**
 * A conversation as it opens at its latest messages, from the window a
 * screen last showed it in this app session, or undefined unless every
 * part of it is live.
 */
function conversationSaved(
  queryClient: QueryClient,
  address: string,
  conversationId: string,
  profiles: ReadonlyMap<string, SavedEntry>,
) {
  const openedAt = latestOpenedAt(address, conversationId);
  if (openedAt === undefined) return undefined;
  const found = conversationQuery(address, conversationId);
  const conversation = liveSelected(queryClient, found);
  const pageQueries = latestPageQueries(address, conversationId, openedAt);
  const pages = complete(
    pageQueries.map((query) => liveSelected(queryClient, query)),
  );
  if (conversation == null || pages === undefined) return undefined;
  const parts = pageParts(queryClient, address, conversation, {
    openedAt,
    pages,
  });
  const entries = complete(
    [
      found.queryKey,
      ...pageQueries.map(({ queryKey }) => queryKey),
      ...parts.keys,
    ].map((key) => entryOf(queryClient, key)),
  );
  const people = complete(
    [...parts.people].map((person) => profiles.get(person)),
  );
  if (entries === undefined || people === undefined) return undefined;
  // A channel's other members, for its title and @mentions, if loaded.
  const others = conversation.members.flatMap((member) =>
    parts.people.has(member) ? [] : (profiles.get(member) ?? []),
  );
  return {
    entries: [...entries, ...people, ...others],
    openedAt,
    savedAt: Date.now(),
  } satisfies Saved;
}

/**
 * Saves what the account's Home shows and its most recent conversations
 * that are live, and deletes the conversations no longer among them.
 */
function save(queryClient: QueryClient, { address, storagePrefix }: Account) {
  const profiles = liveProfiles(queryClient);
  const inbox = inboxSaved(queryClient, address, profiles);
  if (inbox === undefined) return;
  writeSaved(inboxFile(storagePrefix), inbox.saved);
  const versions = new Map<string, number>();
  for (const conversation of inbox.recent) {
    const { conversationId } = conversation;
    const saved = conversationSaved(
      queryClient,
      address,
      conversationId,
      profiles,
    );
    if (saved !== undefined) {
      writeSaved(conversationFile(storagePrefix, conversationId), saved);
    }
    const version = cachedVersion(queryClient, address, conversation);
    if (version !== undefined) versions.set(conversationId, version);
  }
  writeVersions(storagePrefix, versions);
  const recent = new Set(
    inbox.recent.map(({ conversationId }) => conversationId),
  );
  for (const conversationId of savedConversationIds(storagePrefix)) {
    if (!recent.has(conversationId)) {
      deleteSaved(conversationFile(storagePrefix, conversationId));
    }
  }
}

/** Development only: saving stops until the next launch (`forgetForNow`). */
let stopped = false;

/**
 * Development only: deletes what the account saved and saves nothing more
 * until the app launches again, to try a launch with nothing saved.
 * Otherwise leaving the app to close it would save it all again.
 */
export function forgetForNow(storagePrefix: string) {
  stopped = true;
  forgetSaved(storagePrefix);
}

/**
 * Saves an account's Home and recent conversations as the app leaves the
 * screen, if anything changed since it last did. Saving takes the
 * JavaScript thread for tens of milliseconds, so it never runs while the
 * app is in use; what's opened meanwhile is in memory anyway. It saves on
 * "inactive" as well as "background": an app closed from the iPhone's app
 * switcher is only ever inactive. Returns a function that stops.
 */
function startSaving(queryClient: QueryClient, account: Account) {
  let changed = false;
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "success") {
      changed = true;
    }
  });
  const appState = AppState.addEventListener("change", (state) => {
    if (state === "active" || !changed || stopped) return;
    changed = false;
    save(queryClient, account);
  });
  return () => {
    unsubscribe();
    appState.remove();
  };
}

/**
 * Saves every account session's screens while it lasts, keeps what's
 * saved caught up (`refresh-saved`), and notes when its PDS answers
 * (`unanswered.ts`).
 */
export function installSaving() {
  onAccountSession((account) => {
    const stopSaving = startSaving(queryClient, account);
    const stopWatching = watchAnswers(queryClient, account.address);
    const stopRefreshing = refreshSaved(queryClient, account);
    return () => {
      stopSaving();
      stopWatching();
      stopRefreshing();
    };
  });
}

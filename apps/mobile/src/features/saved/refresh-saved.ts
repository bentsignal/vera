import type { Conversation } from "@decentralized-convex/messages";
import type { QueryClient } from "@tanstack/react-query";

import { isInboxQuery, liveInbox } from "~/features/messaging/inbox-rows";
import { refetchConversation } from "~/features/messaging/prefetch";
import { isLive } from "~/features/messaging/stay-live";
import { recentConversations, versionOf } from "./recent";
import { readVersions } from "./saved-files";
import { isUnanswered } from "./unanswered";

/** How many conversations catch up at once. */
const AT_ONCE = 2;

/**
 * For each account, what each of its saved conversations is as of
 * (`versionOf`): as saved, or as cached since, once it's live or caught
 * up. A conversation whose version the Inbox shows is newer is behind.
 */
const versionsByAccount = new Map<string, Map<string, number>>();

function versionsOf(address: string) {
  let versions = versionsByAccount.get(address);
  if (versions === undefined) {
    versions = new Map();
    versionsByAccount.set(address, versions);
  }
  return versions;
}

/**
 * What a conversation's cached messages are as of, to save with them: as
 * the Inbox shows it while they're live, or as last noted.
 */
export function cachedVersion(
  queryClient: QueryClient,
  address: string,
  conversation: Conversation,
) {
  const { conversationId } = conversation;
  return isLive(queryClient, address, conversationId)
    ? versionOf(conversation)
    : versionsByAccount.get(address)?.get(conversationId);
}

/**
 * Keeps an account's saved conversations caught up while it's signed in:
 * when the live Inbox shows one changed (a message, an edit, a reaction)
 * while it isn't open or staying live, fetches its latest messages again,
 * a couple at a time, and the next save writes them. Quiet conversations
 * cost nothing. Returns a function that stops.
 */
export function refreshSaved(
  queryClient: QueryClient,
  account: { readonly address: string; readonly storagePrefix: string },
) {
  const { address } = account;
  const versions = versionsOf(address);
  for (const [id, version] of readVersions(account.storagePrefix)) {
    if (!versions.has(id)) versions.set(id, version);
  }
  const waiting = new Map<string, number>();
  const running = new Set<string>();
  let stopped = false;

  function next() {
    for (const [conversationId, version] of waiting) {
      if (stopped || running.size >= AT_ONCE) return;
      waiting.delete(conversationId);
      running.add(conversationId);
      refetchConversation(queryClient, address, conversationId)
        .then(() => versions.set(conversationId, version))
        // Tried again with the Inbox's next change.
        .catch(() => undefined)
        .finally(() => {
          running.delete(conversationId);
          next();
        });
    }
  }

  function check(conversations: readonly Conversation[]) {
    for (const conversation of recentConversations(conversations)) {
      const { conversationId } = conversation;
      const version = versionOf(conversation);
      const saved = versions.get(conversationId);
      if (isLive(queryClient, address, conversationId)) {
        versions.set(conversationId, version);
      } else if (
        saved !== undefined &&
        saved !== version &&
        !running.has(conversationId)
      ) {
        waiting.set(conversationId, version);
      }
    }
    if (!isUnanswered(address)) next();
  }

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    const watched =
      (event.type === "updated" && isInboxQuery(event.query, address)) ||
      // A conversation's screen closed, or stopped staying live.
      (event.type === "observerRemoved" && !event.query.isActive());
    if (!watched) return;
    const conversations = liveInbox(queryClient, address);
    if (conversations !== undefined) check(conversations);
  });
  return () => {
    stopped = true;
    unsubscribe();
  };
}

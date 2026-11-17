import type { EventEmitter } from "expo";
import type { RefObject } from "react";
import { useEffect, useEffectEvent, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import { useRouter } from "expo-router";

import type { ComposerHandle } from "~/features/conversation/composer";
import type { ConversationSummary } from "~/features/inbox/types";
import { draftKey } from "~/features/conversation/drafts";
import { useAccounts } from "~/features/messaging/account";
import { useInbox } from "~/features/messaging/inbox";
import { openConversation } from "~/features/notifications/push";

/** A chat the Shortcuts app offers to open (`plugins/app-intents`). */
interface ShortcutChat {
  account: string;
  conversationId: string;
  name: string;
  /** Under the name: the space a channel's in, and which account. */
  detail: string;
}

// A `Record`, not an interface, so it fits `EventEmitter`'s events map.
type ShortcutEvents = Record<"onShortcut", () => void>;

type ShortcutsModule = InstanceType<typeof EventEmitter<ShortcutEvents>> & {
  setChats: (chats: ShortcutChat[]) => void;
  takePending: () => {
    action?: string;
    account?: string;
    conversationId?: string;
  } | null;
};

// `modules/shortcuts`, iOS only and loaded optionally: builds made before
// it was added have no shortcuts.
const shortcuts =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<ShortcutsModule>("VeraShortcuts")
    : null;

/** The most chats offered, by most recent activity. */
const MOST_CHATS = 100;

/** The draft of the chat a shortcut opened, until its keyboard is up. */
let focusFor: string | undefined;
const listeners = new Set<() => void>();

function setFocusFor(key: string | undefined) {
  focusFor = key;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Runs the App Shortcuts the Shortcuts app, Siri, Spotlight, or the Action
 * button open the app with (`plugins/app-intents`). "Open Chat" opens the
 * chat picked, as the account it belongs to, with the keyboard up (see
 * `useShortcutFocus`).
 */
export function useShortcuts() {
  const router = useRouter();
  const accounts = useAccounts();

  const run = useEffectEvent(() => {
    const pending = shortcuts?.takePending();
    const { account, conversationId } = pending ?? {};
    if (
      pending?.action !== "openChat" ||
      account === undefined ||
      conversationId === undefined ||
      !accounts.some((signedIn) => signedIn.address === account)
    ) {
      return;
    }
    setFocusFor(draftKey(account, conversationId));
    openConversation(router, conversationId, { account });
  });

  // eslint-disable-next-line no-restricted-syntax -- Runs shortcuts iOS hands the app, waiting since launch or arriving while it's open; nothing in React starts them.
  useEffect(() => {
    if (shortcuts === null) return;
    // Listening first, then taking one already waiting, so none is missed.
    const subscription = shortcuts.addListener("onShortcut", () => run());
    run();
    return () => subscription.remove();
  }, []);
}

function detailOf(summary: ConversationSummary, accounts: number) {
  const where = summary.kind === "channel" ? (summary.spaceName ?? "") : "";
  const who = accounts > 1 ? summary.account : "";
  return [where, who].filter((part) => part !== "").join(" · ");
}

/** The chats to offer: the most recent, alphabetical so the list rarely changes. */
function shortcutChats(
  conversations: readonly ConversationSummary[],
  accounts: number,
) {
  return conversations
    .slice(0, MOST_CHATS)
    .map(
      (summary): ShortcutChat => ({
        account: summary.account,
        conversationId: summary.id,
        name: summary.title,
        detail: detailOf(summary, accounts),
      }),
    )
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** Lists the Inbox's chats for the Shortcuts app, as they change. */
function ShareChats() {
  const { conversations } = useInbox();
  const accounts = useAccounts().length;
  const chats =
    conversations === undefined
      ? undefined
      : shortcutChats(conversations, accounts);
  // Only a change to the list itself reaches iOS.
  const listed = chats === undefined ? undefined : JSON.stringify(chats);
  const publish = useEffectEvent(() => {
    if (chats !== undefined) shortcuts?.setChats(chats);
  });
  // eslint-disable-next-line no-restricted-syntax -- Hands the chats to iOS, which reads them for the Shortcuts app outside React.
  useEffect(() => {
    if (listed !== undefined) publish();
  }, [listed]);
  return null;
}

/** Keeps the Shortcuts app's chats current, where there are App Shortcuts. */
export function ShortcutChats() {
  return shortcuts === null ? null : <ShareChats />;
}

/**
 * Brings the keyboard up in the chat a shortcut opened (the draft `key`),
 * once its messages show.
 */
export function useShortcutFocus(
  key: string,
  composer: RefObject<ComposerHandle | null>,
  shown: boolean,
) {
  const requested = useSyncExternalStore(subscribe, () => focusFor) === key;
  // eslint-disable-next-line no-restricted-syntax -- The request comes from iOS through a shortcut, possibly while this chat is already open; focusing the field is the only way to raise the keyboard.
  useEffect(() => {
    if (!requested || !shown) return;
    setFocusFor(undefined);
    composer.current?.focus();
  }, [requested, shown, composer]);
}

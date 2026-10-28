import type { EventEmitter } from "expo";
import { useEffect, useEffectEvent } from "react";
import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import { useRouter } from "expo-router";
import { directConversationId } from "@decentralized-convex/messages";
import { pds } from "@vera/backend/pds";

import { draftKey } from "~/features/conversation/drafts";
import { startDictation } from "~/features/dictation/session";
import { useRunAs } from "~/features/messaging/account";
import * as optimistic from "~/features/messaging/optimistic";
import { openConversation } from "~/features/notifications/push";
import { useSession } from "~/features/session/session-provider";

// A `Record`, not an interface, so it fits `EventEmitter`'s events map.
type ShortcutEvents = Record<"onShortcut", () => void>;

type ShortcutsModule = InstanceType<typeof EventEmitter<ShortcutEvents>> & {
  takePending: () => string | null;
};

// `modules/shortcuts`, iOS only and loaded optionally: builds made before
// it was added have no shortcuts to run.
const shortcuts =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<ShortcutsModule>("VeraShortcuts")
    : null;

/**
 * Runs the App Shortcuts the Shortcuts app, Siri, Spotlight, or the Action
 * button open the app with (`plugins/app-intents`). "Talk to Vera" opens
 * the conversation with Vera, as the account the Inbox shows (the first,
 * unless it's filtered to one), and starts dictating a message there.
 */
export function useShortcuts() {
  const router = useRouter();
  const runAs = useRunAs();
  const { accounts, filter } = useSession();
  const account =
    accounts.find((candidate) => candidate.address === filter) ?? accounts[0];

  function talkToVera() {
    if (account === undefined) return;
    const { address } = account;
    const vera = `vera@${address.slice(address.lastIndexOf("@") + 1)}`;
    const conversationId = directConversationId(address, vera);
    // Opens right away: the conversation's ID comes from the two addresses.
    void runAs(address, pds.messages.openDirect({ accountId: vera }), {
      optimisticUpdate: (store) =>
        optimistic.openDirect(address)(store, { accountId: vera }),
    });
    startDictation(draftKey(address, conversationId));
    openConversation(router, conversationId, {
      account: address,
      title: "Vera",
    });
  }

  const run = useEffectEvent(() => {
    if (shortcuts?.takePending() === "talkToVera") talkToVera();
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

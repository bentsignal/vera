import { directConversationId } from "@decentralized-convex/messages";
import { api } from "@vera/backend/api";

import { useAccount } from "~/features/messaging/account";
import {
  appVersion,
  channel,
  deviceDetails,
  runningUpdate,
} from "~/features/settings/app-info";

/**
 * After a message to Vera, tells the account's PDS which app version and
 * device it came from, so the bug reports Vera files say. Only Vera gets
 * these, and only the app and device, nothing else.
 */
export function useReportClientToVera() {
  const { address, session } = useAccount();
  return (conversationId: string) => {
    const domain = address.slice(address.lastIndexOf("@") + 1);
    const vera = directConversationId(address, `vera@${domain}`);
    if (conversationId !== vera) return;
    void session
      .convex()
      .then((convex) =>
        convex.mutation(api.supportReporters.reportClient, {
          appVersion: appVersion(),
          channel: channel(),
          update: runningUpdate(),
          ...deviceDetails(),
        }),
      )
      // A PDS from before Vera kept these just files reports without them.
      .catch(() => null);
  };
}

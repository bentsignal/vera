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
 * After a message to Vera Support, tells the account's PDS which app
 * version and device it came from, so the bug reports support files say.
 * Only support gets these, and only the app and device, nothing else.
 */
export function useReportClientToSupport() {
  const { address, session } = useAccount();
  return (conversationId: string) => {
    const domain = address.slice(address.lastIndexOf("@") + 1);
    const support = directConversationId(address, `support@${domain}`);
    if (conversationId !== support) return;
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
      // A PDS from before support kept these just files reports without them.
      .catch(() => null);
  };
}

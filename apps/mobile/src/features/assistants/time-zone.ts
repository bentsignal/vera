import { directConversationId } from "@decentralized-convex/messages";
import { api } from "@vera/backend/api";

import { useAccount } from "~/features/messaging/account";

/** Vera's assistant accounts, by username on the account's own domain. */
const ASSISTANTS = ["support", "vera"];

/** The time zone each account last sent this session, so it's sent once. */
const sent = new Map<string, string>();

/**
 * After a message to one of Vera's assistants, tells the account's PDS the
 * device's time zone, so the assistant knows what time and day it is for
 * them. Sent again only when it changes, such as after travel.
 */
export function useReportTimeZone() {
  const { address, session } = useAccount();
  return (conversationId: string) => {
    const domain = address.slice(address.lastIndexOf("@") + 1);
    const toAssistant = ASSISTANTS.some(
      (username) =>
        conversationId ===
        directConversationId(address, `${username}@${domain}`),
    );
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!toAssistant || sent.get(address) === timeZone) return;
    sent.set(address, timeZone);
    void session
      .convex()
      .then((convex) => convex.mutation(api.timeZones.report, { timeZone }))
      // A PDS from before assistants knew time zones: they go by UTC.
      .catch(() => sent.delete(address));
  };
}

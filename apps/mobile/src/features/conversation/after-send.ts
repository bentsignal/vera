import { useReportClientToSupport } from "~/features/assistants/report-client";
import { useReportTimeZone } from "~/features/assistants/time-zone";
import { useDevTools } from "~/features/dev/dev-tools";

/**
 * What else happens when you send in a conversation: on the dev PDS, its
 * bots answer; in a DM with one of Vera's assistants, it learns your time
 * zone; and in your DM with Vera Support, support learns which app version
 * and device you're on.
 */
export function useAfterSend(conversationId: string) {
  const devTools = useDevTools();
  const reportClient = useReportClientToSupport();
  const reportTimeZone = useReportTimeZone();
  return () => {
    devTools.replyToMe(conversationId);
    reportClient(conversationId);
    reportTimeZone(conversationId);
  };
}

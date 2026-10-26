import { useReportClientToVera } from "~/features/assistants/report-client";
import { useReportTimeZone } from "~/features/assistants/time-zone";
import { useDevTools } from "~/features/dev/dev-tools";

/**
 * What else happens when you send in a conversation: on the dev PDS, its
 * bots answer; and in your DM with Vera, it learns your time zone and which
 * app version and device you're on, for bug reports.
 */
export function useAfterSend(conversationId: string) {
  const devTools = useDevTools();
  const reportClient = useReportClientToVera();
  const reportTimeZone = useReportTimeZone();
  return () => {
    devTools.replyToMe(conversationId);
    reportClient(conversationId);
    reportTimeZone(conversationId);
  };
}

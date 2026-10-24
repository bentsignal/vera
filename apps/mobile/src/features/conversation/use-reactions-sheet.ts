import { useRouter } from "expo-router";

import type { ReactionPart } from "~/features/messaging/reactions";
import { useAccount } from "~/features/messaging/account";

/**
 * Opens the sheet of who reacted to a part, on one emoji if given.
 * `reactionsSince` (from `useMessages`) says which of the screen's queries
 * by time has a message's reactions, so the sheet reads that one.
 */
export function useReactionsSheet(
  conversationId: string,
  {
    reactionsSince,
  }: { reactionsSince: (messageId: string) => number | undefined },
) {
  const router = useRouter();
  const { address } = useAccount();
  return (messageId: string, part: ReactionPart, emoji?: string) =>
    router.push({
      params: {
        account: address,
        conversationId,
        emoji,
        messageId,
        part: String(part),
        since: reactionsSince(messageId)?.toString(),
      },
      pathname: "/reactions",
    });
}

import type { Conversation } from "@decentralized-convex/messages";

/**
 * Who you can @mention in a conversation: everyone in a group or channel
 * but you, and nobody in a direct message.
 */
export function mentionableIn(
  conversation: Pick<Conversation, "kind" | "members"> | undefined,
  self: string,
  profileOf: (accountId: string) => {
    readonly avatarUrl: string | null;
    readonly displayName: string;
    readonly ownName?: string;
  },
) {
  if (conversation === undefined || conversation.kind === "direct") {
    return undefined;
  }
  return conversation.members
    .filter((member) => member !== self)
    .map((accountId) => {
      const { avatarUrl, displayName, ownName } = profileOf(accountId);
      return { accountId, avatarUrl, displayName, mentionName: ownName };
    });
}

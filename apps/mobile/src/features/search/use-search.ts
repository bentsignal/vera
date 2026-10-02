import { useAccounts } from "~/features/messaging/account";
import { useInbox } from "~/features/messaging/conversations";
import { useDisplayNames } from "~/features/messaging/profiles";
import { useSpaces } from "~/features/messaging/spaces";

function matches(needle: string, ...values: readonly string[]) {
  return values.some((value) => value.toLowerCase().includes(needle));
}

/**
 * Conversations, spaces, channels, and people that match a query, across
 * the visible accounts. Each result opens as the account it came from.
 */
export function useSearchResults(query: string) {
  const mine = new Set(useAccounts().map((account) => account.address));
  const { conversations = [] } = useInbox();
  const { spaces } = useSpaces();
  // Each person once, reached through the first account that knows them.
  const people = new Map(
    conversations
      .flatMap((conversation) =>
        conversation.memberIds.map(
          (member) => [member, conversation.account] as const,
        ),
      )
      .filter(([member]) => !mine.has(member))
      .reverse(),
  );
  const displayName = useDisplayNames([...people.keys()]);
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];

  return [
    ...conversations
      .filter((item) => matches(needle, item.title, item.lastMessage))
      .map((item) => ({
        id: `conversation:${item.key}`,
        kind: "conversation" as const,
        subtitle: item.lastMessage,
        target: {
          account: item.account,
          conversationId: item.id,
          title: item.title,
        },
        title: item.title,
      })),
    ...[...people]
      .filter(([person]) => matches(needle, person, displayName(person)))
      .map(([person, account]) => ({
        id: `person:${person}`,
        kind: "person" as const,
        subtitle: person,
        target: { account, accountId: person },
        title: displayName(person),
      })),
    ...spaces
      .filter((space) => matches(needle, space.name))
      .map((space) => ({
        id: `space:${space.key}`,
        kind: "space" as const,
        subtitle: `${space.members.length} members`,
        target: {
          account: space.account,
          name: space.name,
          spaceId: space.spaceId,
        },
        title: space.name,
      })),
    ...spaces.flatMap((space) =>
      space.channels
        .filter((channel) => matches(needle, channel.name))
        .map((channel) => ({
          id: `channel:${space.account} ${channel.conversationId}`,
          kind: "channel" as const,
          subtitle: space.name,
          target: {
            account: space.account,
            conversationId: channel.conversationId,
            title: `#${channel.name}`,
          },
          title: `#${channel.name}`,
        })),
    ),
  ];
}

export type SearchResult = ReturnType<typeof useSearchResults>[number];

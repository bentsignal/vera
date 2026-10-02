import { useAccount } from "~/features/messaging/account";
import { useInbox } from "~/features/messaging/conversations";
import { useDisplayNames } from "~/features/messaging/profiles";
import { useSpaces } from "~/features/messaging/spaces";

function matches(needle: string, ...values: readonly string[]) {
  return values.some((value) => value.toLowerCase().includes(needle));
}

/** Conversations, spaces, channels, and people that match a query. */
export function useSearchResults(query: string) {
  const { address } = useAccount();
  const { conversations = [] } = useInbox();
  const { spaces } = useSpaces();
  const people = [
    ...new Set(conversations.flatMap((conversation) => conversation.memberIds)),
  ].filter((member) => member !== address);
  const displayName = useDisplayNames(people);
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];

  return [
    ...conversations
      .filter((item) => matches(needle, item.title, item.lastMessage))
      .map((item) => ({
        id: `conversation:${item.id}`,
        kind: "conversation" as const,
        subtitle: item.lastMessage,
        target: { conversationId: item.id, title: item.title },
        title: item.title,
      })),
    ...people
      .filter((person) => matches(needle, person, displayName(person)))
      .map((person) => ({
        id: `person:${person}`,
        kind: "person" as const,
        subtitle: person,
        target: { accountId: person },
        title: displayName(person),
      })),
    ...spaces
      .filter((space) => matches(needle, space.name))
      .map((space) => ({
        id: `space:${space.spaceId}`,
        kind: "space" as const,
        subtitle: `${space.members.length} members`,
        target: { name: space.name, spaceId: space.spaceId },
        title: space.name,
      })),
    ...spaces.flatMap((space) =>
      space.channels
        .filter((channel) => matches(needle, channel.name))
        .map((channel) => ({
          id: `channel:${channel.conversationId}`,
          kind: "channel" as const,
          subtitle: space.name,
          target: {
            conversationId: channel.conversationId,
            title: `#${channel.name}`,
          },
          title: `#${channel.name}`,
        })),
    ),
  ];
}

export type SearchResult = ReturnType<typeof useSearchResults>[number];

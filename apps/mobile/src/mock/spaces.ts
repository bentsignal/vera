import type { Space } from "~/features/spaces/types";

export const spaces = [
  {
    id: "space-climbing",
    name: "Boulder Club",
    description: "Weekly sessions, trips, and beta.",
    memberCount: 24,
    channels: [
      {
        id: "general",
        name: "general",
        topic: "Anything climbing",
        unreadCount: 3,
      },
      {
        id: "sessions",
        name: "sessions",
        topic: "Who's going when",
        unreadCount: 0,
      },
      {
        id: "trips",
        name: "trips",
        topic: "Outdoor trip planning",
        unreadCount: 1,
      },
      {
        id: "beta",
        name: "beta",
        topic: "Spoilers for problems",
        unreadCount: 0,
      },
    ],
  },
  {
    id: "space-vera",
    name: "Vera Builders",
    description: "People building and testing Vera.",
    memberCount: 9,
    channels: [
      {
        id: "announcements",
        name: "announcements",
        topic: "Release notes",
        unreadCount: 0,
      },
      {
        id: "feedback",
        name: "feedback",
        topic: "Bugs and ideas",
        unreadCount: 6,
      },
      {
        id: "self-hosting",
        name: "self-hosting",
        topic: "Running your own PDS",
        unreadCount: 0,
      },
    ],
  },
  {
    id: "space-books",
    name: "Book Club",
    description: "One book a month, no pressure.",
    memberCount: 7,
    channels: [
      {
        id: "current-book",
        name: "current-book",
        topic: "This month's pick",
        unreadCount: 0,
      },
      {
        id: "suggestions",
        name: "suggestions",
        topic: "What to read next",
        unreadCount: 0,
      },
    ],
  },
] satisfies Space[];

export function findSpace(id: string) {
  return spaces.find((space) => space.id === id);
}

/** Channel conversations are addressed as `<spaceId>.<channelId>`. */
export function channelConversationId(spaceId: string, channelId: string) {
  return `${spaceId}.${channelId}`;
}

import type { ConversationSummary } from "~/features/inbox/types";
import { ago } from "./time";

export const inbox = [
  {
    id: "dm-maya",
    kind: "direct",
    title: "Maya Chen",
    memberIds: ["shawn", "maya"],
    lastMessage: "Sending the photos from Saturday now",
    lastActivityAt: ago({ minutes: 4 }),
    unreadCount: 2,
  },
  {
    id: "group-climbing",
    kind: "group",
    title: "Climbing crew",
    memberIds: ["shawn", "jonah", "priya", "leo"],
    lastMessage: "Priya: Gym at 7 tomorrow?",
    lastActivityAt: ago({ minutes: 38 }),
    unreadCount: 5,
  },
  {
    id: "dm-jonah",
    kind: "direct",
    title: "Jonah Weiss",
    memberIds: ["shawn", "jonah"],
    lastMessage: "You: The invite code works, see you in there",
    lastActivityAt: ago({ hours: 3 }),
    unreadCount: 0,
  },
  {
    id: "group-family",
    kind: "group",
    title: "Family",
    memberIds: ["shawn", "ava", "sam"],
    lastMessage: "Ava: Photo",
    lastActivityAt: ago({ days: 1, hours: 2 }),
    unreadCount: 0,
  },
  {
    id: "dm-priya",
    kind: "direct",
    title: "Priya Natarajan",
    memberIds: ["shawn", "priya"],
    lastMessage: "Here's the doc I mentioned",
    lastActivityAt: ago({ days: 3 }),
    unreadCount: 0,
  },
  {
    id: "dm-leo",
    kind: "direct",
    title: "Leo Martins",
    memberIds: ["shawn", "leo"],
    lastMessage: "haha yes",
    lastActivityAt: ago({ days: 9 }),
    unreadCount: 0,
  },
] satisfies ConversationSummary[];

export function findConversation(id: string) {
  return inbox.find((conversation) => conversation.id === id);
}

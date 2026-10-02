import type { Message } from "~/features/conversation/types";
import type { ConversationKind } from "~/features/inbox/types";
import { findConversation } from "./inbox";
import { findPerson } from "./people";
import { findSpace } from "./spaces";
import { ago } from "./time";

interface Thread {
  title: string;
  kind: ConversationKind;
  messages: Message[];
}

function text(id: string, authorId: string, sentAt: Date, body: string) {
  return { id, authorId, sentAt, body, attachments: [] } satisfies Message;
}

function directMessages(otherId: string) {
  return [
    text(
      "m1",
      otherId,
      ago({ days: 2, hours: 5 }),
      "Are you around this weekend?",
    ),
    text(
      "m2",
      "shawn",
      ago({ days: 2, hours: 4, minutes: 58 }),
      "Saturday works. Climbing?",
    ),
    text(
      "m3",
      otherId,
      ago({ days: 2, hours: 4, minutes: 55 }),
      "Yes! The new gym on 5th",
    ),
    text("m4", "shawn", ago({ days: 1, hours: 3 }), "Did you see this?"),
    {
      id: "m5",
      authorId: "shawn",
      sentAt: ago({ days: 1, hours: 3 }),
      body: "https://vera.chat/blog/decentralized-convex",
      attachments: [],
      linkPreview: {
        url: "https://vera.chat/blog/decentralized-convex",
        siteName: "vera.chat",
        title: "Messaging across independently hosted servers",
        description:
          "How Vera keeps your data on your home server while conversations span many.",
      },
    },
    text(
      "m6",
      otherId,
      ago({ days: 1, hours: 1 }),
      "Reading it now, this is wild",
    ),
    {
      id: "m7",
      authorId: otherId,
      sentAt: ago({ minutes: 9 }),
      body: "Sending the photos from Saturday now",
      attachments: [
        { kind: "image", id: "a1", width: 1600, height: 1200 },
        {
          kind: "video",
          id: "a2",
          width: 1080,
          height: 1920,
          durationSeconds: 42,
        },
      ],
    },
    {
      id: "m8",
      authorId: otherId,
      sentAt: ago({ minutes: 4 }),
      attachments: [
        { kind: "file", id: "a3", name: "route-map.pdf", sizeBytes: 2_400_000 },
      ],
    },
  ] satisfies Message[];
}

function groupMessages(memberIds: string[]) {
  const [, first = "jonah", second = "priya", third = first] = memberIds;
  return [
    text("g1", first, ago({ hours: 5 }), "Who's in for tomorrow?"),
    text("g2", second, ago({ hours: 4, minutes: 50 }), "Me, after work"),
    text("g3", "shawn", ago({ hours: 4, minutes: 45 }), "I'm in"),
    text("g4", third, ago({ hours: 1 }), "Same, bringing the new shoes"),
    text("g5", second, ago({ minutes: 38 }), "Gym at 7 tomorrow?"),
  ] satisfies Message[];
}

function channelThread(conversationId: string) {
  const [spaceId = "", channelId = ""] = conversationId.split(".");
  const channel = findSpace(spaceId)?.channels.find(
    ({ id }) => id === channelId,
  );
  if (!channel) return undefined;
  return {
    title: `#${channel.name}`,
    kind: "channel",
    messages: groupMessages(["shawn", "leo", "ava", "sam"]),
  } satisfies Thread;
}

/** A new direct conversation started from the compose sheet. */
function newDirectThread(conversationId: string) {
  const person = findPerson(conversationId.replace(/^dm-/, ""));
  if (!person) return undefined;
  return {
    title: person.displayName,
    kind: "direct",
    messages: [],
  } satisfies Thread;
}

export function findThread(conversationId: string) {
  const conversation = findConversation(conversationId);
  if (!conversation) {
    return conversationId.startsWith("dm-")
      ? newDirectThread(conversationId)
      : channelThread(conversationId);
  }
  const messages =
    conversation.kind === "direct"
      ? directMessages(conversation.memberIds[1] ?? "maya")
      : groupMessages(conversation.memberIds);
  return {
    title: conversation.title,
    kind: conversation.kind,
    messages,
  } satisfies Thread;
}

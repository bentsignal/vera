// Tests only: an account with a bit of everything the badge counts. The
// second dot in its name keeps Convex from bundling it as a module.

export const ME = "me@vera.chat";
export const FRIEND = "friend@vera.chat";
export const HOUR = 60 * 60 * 1000;
export const NOW = 30 * 24 * HOUR;

export function message(
  conversationId: string,
  authorId: string,
  sentAt: number,
  extra = {},
) {
  return {
    attachments: [],
    authorId,
    authorName: authorId,
    body: "hi",
    conversationId,
    messageId: `${conversationId}:${sentAt}`,
    sentAt,
    ...extra,
  };
}

export function conversation(
  conversationId: string,
  kind: string,
  spaceId?: string,
) {
  return { conversationId, createdBy: FRIEND, kind, spaceId, updatedAt: 0 };
}

export function member(conversationId: string, extra = {}) {
  return {
    accountId: ME,
    conversationId,
    lastReadAt: NOW - 2 * HOUR,
    muted: false,
    role: "member",
    ...extra,
  };
}

function chats() {
  const conversations = [];
  const members = [];
  const messages = [];
  for (let index = 0; index < 24; index += 1) {
    const kind = index % 2 === 0 ? "direct" : "group";
    const id = `${kind}:${index}`;
    conversations.push(conversation(id, kind));
    const alerts = index === 3 || index === 5 ? "mentions" : undefined;
    members.push(member(id, { alerts, muted: index === 7 }));
    for (let at = 1; at <= 4; at += 1) {
      messages.push(message(id, FRIEND, NOW - 3 * HOUR + at * 30 * 60_000));
    }
  }
  return { conversations, members, messages };
}

function channels() {
  const conversations = [];
  const members = [];
  const messages = [];
  const spaceMembers = [];
  const spaces = [];
  for (const space of ["space:a", "space:b"]) {
    spaces.push({ createdBy: FRIEND, name: space, spaceId: space });
    spaceMembers.push({
      accountId: ME,
      joinedAt: 0,
      role: "member",
      spaceId: space,
    });
    for (let index = 0; index < 4; index += 1) {
      const id = `channel:${space}:${index}`;
      conversations.push(conversation(id, "channel", space));
      members.push(member(id, { alerts: "all" }));
      for (let at = 1; at <= 3; at += 1) {
        messages.push(message(id, FRIEND, NOW - 3 * HOUR + at * 40 * 60_000));
      }
    }
  }
  return { conversations, members, messages, spaceMembers, spaces };
}

/**
 * An account in 24 direct messages and groups (two at Mentions, one
 * muted) and 8 channels in two spaces, each with messages read and
 * unread, with threads, mentions, and reactions to its messages.
 */
export function busyAccount() {
  const chatRows = chats();
  const channelRows = channels();
  const conversations = [
    ...chatRows.conversations,
    ...channelRows.conversations,
  ];
  const members = [...chatRows.members, ...channelRows.members];
  const messages: ReturnType<typeof message>[] = [
    ...chatRows.messages,
    ...channelRows.messages,
  ];
  const { spaceMembers, spaces } = channelRows;
  const threadMembers = [];
  for (let index = 0; index < 4; index += 1) {
    const threadId = `group:1:${NOW - 3 * HOUR + 30 * 60_000}`;
    messages.push(
      message("group:1", FRIEND, NOW - HOUR + index * 1000, {
        messageId: `reply:${index}`,
        threadId,
        threadOnly: true,
      }),
    );
    if (index === 0) {
      threadMembers.push({
        accountId: ME,
        conversationId: "group:1",
        lastReadAt: NOW - 2 * HOUR,
        lastReplyAt: NOW - HOUR,
        threadId,
      });
    }
  }
  const mine = message("group:9", ME, NOW - 4 * HOUR);
  messages.push(mine);
  return {
    conversations,
    members,
    mentions: [
      {
        accountId: ME,
        conversationId: "group:3",
        messageId: "group:3:mention",
        sentAt: NOW - HOUR,
      },
    ],
    messages: [
      ...messages,
      message("group:3", FRIEND, NOW - HOUR, {
        mentions: [{ accountId: ME, name: "Me" }],
        messageId: "group:3:mention",
      }),
    ],
    reactions: [
      {
        accountId: FRIEND,
        conversationId: "group:9",
        emoji: "👍",
        messageAuthorId: ME,
        messageId: mine.messageId,
        reactedAt: NOW - HOUR,
      },
    ],
    spaceMembers,
    spaces,
    threadMembers,
  };
}

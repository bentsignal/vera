import assert from "node:assert/strict";
import test from "node:test";

import type { QueryCtx } from "./_generated/server.js";
import { badgeCount } from "./badges.ts";

type Row = Record<string, unknown> & { _creationTime: number; _id: string };

const INDEXES: Record<string, Record<string, string[]>> = {
  conversations: {
    by_conversation: ["conversationId"],
    by_space: ["spaceId"],
  },
  members: {
    by_account: ["accountId"],
    by_conversation_account: ["conversationId", "accountId"],
  },
  messages: { by_conversation_sent: ["conversationId", "sentAt"] },
  spaceInvites: {
    by_account: ["accountId"],
    by_space_account: ["spaceId", "accountId"],
  },
  spaceMembers: {
    by_account: ["accountId"],
    by_space_account: ["spaceId", "accountId"],
  },
  spaces: { by_space: ["spaceId"] },
};

function compare(left: unknown, right: unknown) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right));
}

/** Just enough of Convex's reader for the badge count's queries. */
function fakeCtx(tables: Record<string, Record<string, unknown>[]>) {
  let clock = 0;
  const rows: Record<string, Row[]> = {};
  for (const [table, values] of Object.entries(tables)) {
    rows[table] = values.map((value) => ({
      _creationTime: (clock += 1),
      _id: `${table}:${clock}`,
      ...value,
    }));
  }

  function select(table: string, index: string, filters: Filter[]) {
    const fields = INDEXES[table]?.[index];
    if (fields === undefined) throw new Error(`No index ${table}.${index}`);
    return (rows[table] ?? [])
      .filter((row) => filters.every((filter) => filter(row)))
      .sort((left, right) => {
        for (const field of [...fields, "_creationTime"]) {
          const order = compare(left[field], right[field]);
          if (order !== 0) return order;
        }
        return 0;
      });
  }

  type Filter = (row: Row) => boolean;
  function range() {
    const filters: Filter[] = [];
    const builder = {
      eq: (field: string, value: unknown) => {
        filters.push((row) => row[field] === value);
        return builder;
      },
      gt: (field: string, value: number) => {
        filters.push((row) => Number(row[field]) > value);
        return builder;
      },
      filters,
    };
    return builder;
  }

  function results(found: Row[]) {
    return {
      [Symbol.asyncIterator]: async function* () {
        yield* found;
        await Promise.resolve();
      },
      collect: () => Promise.resolve(found),
      first: () => Promise.resolve(found[0] ?? null),
      order: (direction: "asc" | "desc") =>
        results(direction === "desc" ? [...found].reverse() : found),
      take: (count: number) => Promise.resolve(found.slice(0, count)),
      unique: () => {
        if (found.length > 1) throw new Error("Not unique");
        return Promise.resolve(found[0] ?? null);
      },
    };
  }

  const ctx = {
    db: {
      query: (table: string) => ({
        withIndex: (
          index: string,
          build: (builder: ReturnType<typeof range>) => unknown,
        ) => {
          const builder = range();
          build(builder);
          return results(select(table, index, builder.filters));
        },
      }),
    },
  };
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- A partial fake of the Convex reader.
  return ctx as unknown as QueryCtx;
}

const ME = "me@vera.chat";
const FRIEND = "friend@vera.chat";

function message(conversationId: string, authorId: string, sentAt: number) {
  return {
    attachments: [],
    authorId,
    authorName: authorId,
    body: "hi",
    conversationId,
    messageId: `${conversationId}:${sentAt}`,
    sentAt,
  };
}

function member(conversationId: string, lastReadAt: number, extra = {}) {
  return {
    accountId: ME,
    conversationId,
    lastReadAt,
    muted: false,
    role: "member",
    ...extra,
  };
}

function conversation(conversationId: string, kind: string, spaceId?: string) {
  return {
    conversationId,
    createdBy: FRIEND,
    kind,
    spaceId,
    updatedAt: 0,
  };
}

void test("counts conversations with unread messages, not messages", async () => {
  const ctx = fakeCtx({
    conversations: [
      conversation("direct:a", "direct"),
      conversation("direct:b", "direct"),
      conversation("group:c", "group"),
    ],
    members: [
      member("direct:a", 10),
      member("direct:b", 10),
      member("group:c", 10, { muted: true }),
    ],
    messages: [
      // Three unread in one conversation count once.
      message("direct:a", FRIEND, 11),
      message("direct:a", FRIEND, 12),
      message("direct:a", FRIEND, 13),
      // Read already.
      message("direct:b", FRIEND, 5),
      // Muted conversations still count, as in the inbox.
      message("group:c", FRIEND, 20),
    ],
  });
  assert.equal(await badgeCount(ctx, ME), 2);
});

void test("ignores your own messages", async () => {
  const ctx = fakeCtx({
    conversations: [conversation("direct:a", "direct")],
    members: [member("direct:a", 10)],
    messages: [message("direct:a", ME, 11), message("direct:a", ME, 12)],
  });
  assert.equal(await badgeCount(ctx, ME), 0);
});

void test("counts channels shown in the inbox", async () => {
  const ctx = fakeCtx({
    conversations: [
      conversation("channel:general", "channel", "space:1"),
      conversation("channel:hidden", "channel", "space:1"),
      conversation("channel:fresh", "channel", "space:1"),
      conversation("channel:other", "channel", "space:2"),
    ],
    // Read state is stored lazily: only the hidden channel has a row.
    members: [member("channel:hidden", 0, { hiddenFromInbox: true })],
    messages: [
      // Before joining the space, so already read.
      message("channel:general", FRIEND, 0),
      message("channel:hidden", FRIEND, 50),
      message("channel:fresh", FRIEND, 50),
      // Not your space.
      message("channel:other", FRIEND, 50),
    ],
    spaceMembers: [{ accountId: ME, role: "member", spaceId: "space:1" }],
    spaces: [{ createdBy: FRIEND, name: "One", spaceId: "space:1" }],
  });
  assert.equal(await badgeCount(ctx, ME), 1);
});

void test("adds pending invitations to spaces that still exist", async () => {
  const ctx = fakeCtx({
    conversations: [conversation("direct:a", "direct")],
    members: [member("direct:a", 0)],
    messages: [message("direct:a", FRIEND, 1)],
    spaceInvites: [
      { accountId: ME, invitedBy: FRIEND, spaceId: "space:1" },
      { accountId: ME, invitedBy: FRIEND, spaceId: "space:2" },
      // Deleted space.
      { accountId: ME, invitedBy: FRIEND, spaceId: "space:gone" },
      { accountId: FRIEND, invitedBy: ME, spaceId: "space:1" },
    ],
    spaces: [
      { createdBy: FRIEND, name: "One", spaceId: "space:1" },
      { createdBy: FRIEND, name: "Two", spaceId: "space:2" },
    ],
  });
  assert.equal(await badgeCount(ctx, ME), 3);
});

void test("is zero with nothing waiting", async () => {
  assert.equal(await badgeCount(fakeCtx({}), ME), 0);
});

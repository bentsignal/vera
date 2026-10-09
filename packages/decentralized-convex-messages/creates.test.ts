import assert from "node:assert/strict";
import test from "node:test";
import { ConvexError } from "convex/values";

import type { MutationCtx } from "./_generated/server.js";
import { inbox } from "./inbox.ts";
import { newId, optionalName } from "./model.ts";
import { channelName, createdId, listNames } from "./naming.ts";
import { createChannel, createSpace } from "./spaces.ts";

type Row = Record<string, unknown> & { _creationTime: number; _id: string };
type Filter = (row: Row) => boolean;

const ME = "me@vera.chat";
const NEIGHBOR = "neighbor@vera.chat";
const UUID = "0b7c6a1e-1d2f-4c3b-9a8e-7f6d5c4b3a21";
const OTHER_UUID = "9f8e7d6c-5b4a-4321-8fed-cba987654321";

/** Just enough of Convex's database for creating and listing. */
function fakeCtx() {
  let clock = 0;
  const tables = new Map<string, Row[]>();
  function rows(table: string) {
    const found = tables.get(table) ?? [];
    tables.set(table, found);
    return found;
  }

  function results(found: Row[]) {
    return {
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

  const db = {
    insert: (table: string, value: Record<string, unknown>) => {
      clock += 1;
      const row = { _creationTime: clock, _id: `${table}:${clock}`, ...value };
      rows(table).push(row);
      return Promise.resolve(row._id);
    },
    patch: (id: string, value: Record<string, unknown>) => {
      for (const table of tables.values()) {
        const row = table.find((found) => found._id === id);
        if (row !== undefined) Object.assign(row, value);
      }
      return Promise.resolve();
    },
    query: (table: string) => ({
      withIndex: (
        _index: string,
        build: (range: Record<string, unknown>) => unknown,
      ) => {
        const filters: Filter[] = [];
        const range = {
          eq: (field: string, value: unknown) => {
            filters.push((row) => row[field] === value);
            return range;
          },
          gt: (field: string, value: number) => {
            filters.push((row) => Number(row[field]) > value);
            return range;
          },
        };
        build(range);
        return results(
          rows(table).filter((row) => filters.every((filter) => filter(row))),
        );
      },
    }),
  };
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- A partial fake of the Convex database.
  return { ctx: { db } as unknown as MutationCtx, rows };
}

function codeOf(error: unknown) {
  if (!(error instanceof ConvexError)) return undefined;
  const data: unknown = error.data;
  return typeof data === "object" && data !== null && "code" in data
    ? data.code
    : undefined;
}

function failsWith(code: string) {
  return (error: unknown) => codeOf(error) === code;
}

void test("titles unnamed groups with their members", () => {
  assert.equal(listNames([]), "");
  assert.equal(listNames(["Maya"]), "Maya");
  assert.equal(listNames(["Maya", "Leo"]), "Maya & Leo");
  assert.equal(listNames(["Maya", "Leo", "Priya"]), "Maya, Leo & Priya");
});

void test("group names are optional", () => {
  assert.equal(optionalName(undefined), undefined);
  assert.equal(optionalName("   "), undefined);
  assert.equal(optionalName(" Climbing "), "Climbing");
  assert.throws(() => optionalName("x".repeat(81)), failsWith("INVALID_NAME"));
});

void test("stores channel names lowercase with dashes", () => {
  assert.equal(channelName(" #Book Club "), "book-club");
});

void test("uses a proposed ID only if it names the creator's domain", () => {
  const proposed = createdId("group", ME, UUID);
  assert.equal(proposed, `group:vera.chat:${UUID}`);
  assert.equal(newId("group", ME, proposed), proposed);
  assert.match(newId("group", ME), /^group:vera\.chat:[0-9a-f-]{36}$/);
  for (const bad of [
    createdId("space", ME, UUID),
    createdId("group", "me@elsewhere.chat", UUID),
    createdId("group", ME, "not-a-uuid"),
    createdId("group", ME, UUID.toUpperCase()),
  ]) {
    assert.throws(() => newId("group", ME, bad), failsWith("INVALID_ID"));
  }
});

void test("creates a space and its #general with the app's IDs", async () => {
  const { ctx, rows } = fakeCtx();
  const spaceId = createdId("space", ME, UUID);
  const generalChannelId = createdId("channel", ME, OTHER_UUID);
  const args = { generalChannelId, name: " Climbing ", spaceId };

  assert.deepEqual(await createSpace(ctx, ME, args), { spaceId });
  // A retry returns the same space without making another.
  assert.deepEqual(await createSpace(ctx, ME, args), { spaceId });
  assert.equal(rows("spaces").length, 1);
  assert.equal(rows("spaces")[0]?.name, "Climbing");
  assert.deepEqual(
    rows("conversations").map(({ conversationId, name }) => ({
      conversationId,
      name,
    })),
    [{ conversationId: generalChannelId, name: "general" }],
  );

  await assert.rejects(createSpace(ctx, NEIGHBOR, args), failsWith("ID_TAKEN"));
});

void test("creates a channel with the app's ID", async () => {
  const { ctx, rows } = fakeCtx();
  const { spaceId } = await createSpace(ctx, ME, { name: "Climbing" });
  const conversationId = createdId("channel", ME, UUID);
  const args = { conversationId, name: "Book Club", spaceId };

  assert.deepEqual(await createChannel(ctx, ME, args), { conversationId });
  assert.deepEqual(await createChannel(ctx, ME, args), { conversationId });
  const channels = rows("conversations").filter(
    (row) => row.conversationId === conversationId,
  );
  assert.deepEqual(
    channels.map(({ name, position }) => ({ name, position })),
    [{ name: "book-club", position: 1 }],
  );

  // The ID can't be reused for a channel in another space.
  const other = await createSpace(ctx, ME, { name: "Other" });
  await assert.rejects(
    createChannel(ctx, ME, { ...args, spaceId: other.spaceId }),
    failsWith("ID_TAKEN"),
  );
});

void test("lists the inbox newest first, with channels", async () => {
  const { ctx } = fakeCtx();
  const { db } = ctx;
  await db.insert("conversations", {
    conversationId: "direct:a",
    createdBy: ME,
    kind: "direct",
    updatedAt: 10,
  });
  await db.insert("members", {
    accountId: ME,
    conversationId: "direct:a",
    lastReadAt: 0,
    muted: false,
    role: "member",
  });
  await db.insert("conversations", {
    conversationId: "group:b",
    createdBy: ME,
    kind: "group",
    updatedAt: 30,
  });
  await db.insert("members", {
    accountId: ME,
    conversationId: "group:b",
    lastReadAt: 0,
    muted: false,
    role: "owner",
  });
  const { spaceId } = await createSpace(ctx, ME, { name: "Climbing" });

  const listed = await inbox(ctx, ME, { channels: true });
  assert.deepEqual(
    listed.map(({ conversationId, name }) => [conversationId, name]),
    [
      [listed[0]?.conversationId ?? "", "general"],
      ["group:b", null],
      ["direct:a", null],
    ],
  );
  assert.equal(listed[0]?.spaceId, spaceId);
  assert.deepEqual(
    (await inbox(ctx, ME, {})).map(({ conversationId }) => conversationId),
    ["group:b", "direct:a"],
  );
});

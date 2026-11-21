import assert from "node:assert/strict";
import test from "node:test";

import type { MutationCtx } from "./_generated/server.js";
import type { LinkPreview } from "./protocol.ts";
import {
  cachedCards,
  cardsForMessage,
  claimFetches,
  expire,
  FETCH_LIFETIME_MS,
  fetchableUrls,
  giveUp,
  isPublicWebUrl,
  MISSING_LIFETIME_MS,
  PREVIEW_LIFETIME_MS,
  storeResult,
} from "./linkCache.ts";

type Row = Record<string, unknown> & { _id: string };

/** Just enough of Convex's database for the cache and messages. */
function fakeCtx() {
  let next = 0;
  const tables = new Map<string, Row[]>();
  function rows(table: string) {
    const found = tables.get(table) ?? [];
    tables.set(table, found);
    return found;
  }
  function find(id: string) {
    for (const table of tables.values()) {
      const index = table.findIndex((row) => row._id === id);
      if (index !== -1) return { index, table };
    }
    return undefined;
  }
  const db = {
    delete: (id: string) => {
      const found = find(id);
      found?.table.splice(found.index, 1);
      return Promise.resolve();
    },
    insert: (table: string, value: Record<string, unknown>) => {
      next += 1;
      const row = { _id: `${table}:${next}`, ...value };
      rows(table).push(row);
      return Promise.resolve(row._id);
    },
    replace: (id: string, value: Record<string, unknown>) => {
      const found = find(id);
      if (found !== undefined) found.table[found.index] = { _id: id, ...value };
      return Promise.resolve();
    },
    patch: (id: string, value: Record<string, unknown>) => {
      const found = find(id);
      const row = found?.table[found.index];
      if (row !== undefined) {
        for (const [key, field] of Object.entries(value)) {
          // Convex removes a field patched to undefined.
          if (field === undefined) Reflect.deleteProperty(row, key);
          else row[key] = field;
        }
      }
      return Promise.resolve();
    },
    query: (table: string) => ({
      withIndex: (
        _index: string,
        build: (range: Record<string, unknown>) => unknown,
      ) => {
        const filters: ((row: Row) => boolean)[] = [];
        const range = {
          eq: (field: string, value: unknown) => {
            filters.push((row) => row[field] === value);
            return range;
          },
        };
        build(range);
        const found = rows(table).filter((row) =>
          filters.every((filter) => filter(row)),
        );
        return {
          collect: () => Promise.resolve([...found]),
          unique: () => Promise.resolve(found[0] ?? null),
        };
      },
    }),
  };
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- A partial fake of the Convex database.
  return { ctx: { db } as unknown as MutationCtx, rows };
}

const A = "https://a.com/story";
const B = "https://b.com";
const PREVIEW_A: LinkPreview = { title: "A story", url: "https://a.com/s" };
const PREVIEW_B: LinkPreview = { title: "B", url: B };

async function insertMessage(
  ctx: MutationCtx,
  messageId: string,
  links: readonly string[],
  now: number,
) {
  const linked = await cardsForMessage(ctx, messageId, links, now);
  await ctx.db.insert("messages", {
    attachments: [],
    authorId: "me@vera.chat",
    authorName: "Me",
    body: links.join(" "),
    conversationId: "direct:x",
    linkPreview: linked.cards[0]?.preview ?? undefined,
    linkPreviews: linked.cards,
    messageId,
    sentAt: now,
  });
  return linked;
}

void test("only fetches public web links", () => {
  for (const url of [
    "https://vera.chat/x",
    "http://example.com",
    "https://8.8.8.8/",
    "https://[2606:4700::1111]/",
  ]) {
    assert.equal(isPublicWebUrl(url), true, url);
  }
  for (const url of [
    "ftp://example.com",
    "https://localhost:3000",
    "http://printer.local",
    "http://intranet",
    "http://127.0.0.1",
    "http://0x7f.1",
    "http://10.1.2.3",
    "http://172.20.0.1",
    "http://192.168.1.1",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://[::ffff:10.0.0.1]/",
    "not a url",
  ]) {
    assert.equal(isPublicWebUrl(url), false, url);
  }
  assert.deepEqual(
    fetchableUrls([
      A,
      A,
      "http://localhost",
      B,
      "https://c.com",
      "https://d.com",
    ]),
    [A, B, "https://c.com"],
  );
});

void test("a prefetch fetches each link once until it expires", async () => {
  const { ctx } = fakeCtx();
  assert.deepEqual(await claimFetches(ctx, [A], 0), [
    { at: FETCH_LIFETIME_MS, url: A },
  ]);
  // Typing on doesn't fetch it again while the first fetch runs.
  assert.deepEqual(await claimFetches(ctx, [A, B], 10), [
    { at: 10 + FETCH_LIFETIME_MS, url: B },
  ]);
  assert.deepEqual(await cachedCards(ctx, [A], 20), [{ link: A }]);

  await storeResult(ctx, A, PREVIEW_A, 100);
  assert.deepEqual(await cachedCards(ctx, [A, B], 200), [
    { link: A, preview: PREVIEW_A },
    { link: B },
  ]);
  assert.deepEqual(await claimFetches(ctx, [A], 200), []);
  // Once it expires, it's fetched again.
  const later = 100 + PREVIEW_LIFETIME_MS;
  assert.deepEqual(await cachedCards(ctx, [A], later), [{ link: A }]);
  assert.equal((await claimFetches(ctx, [A], later)).length, 1);
});

void test("a link with no preview is retried after a while", async () => {
  const { ctx } = fakeCtx();
  await storeResult(ctx, A, null, 0);
  assert.deepEqual(await cachedCards(ctx, [A], 1), [
    { link: A, preview: null },
  ]);
  assert.deepEqual(await claimFetches(ctx, [A], 1), []);
  assert.equal((await claimFetches(ctx, [A], MISSING_LIFETIME_MS)).length, 1);
});

void test("a message starts with prefetched cards", async () => {
  const { ctx, rows } = fakeCtx();
  await storeResult(ctx, A, PREVIEW_A, 0);
  const linked = await insertMessage(ctx, "m1", [A, "http://localhost"], 10);
  assert.deepEqual(linked.cards, [
    { link: A, preview: PREVIEW_A },
    { link: "http://localhost", preview: null },
  ]);
  assert.deepEqual(linked.waiting, []);
  assert.deepEqual(linked.toFetch, []);
  assert.equal(rows("linkPreviewWaits").length, 0);
});

void test("waiting cards fill in as their fetches finish", async () => {
  const { ctx, rows } = fakeCtx();
  // B's fetch started while typing; A's starts with the message.
  await claimFetches(ctx, [B], 0);
  const linked = await insertMessage(ctx, "m1", [A, B], 10);
  assert.deepEqual(linked.cards, [{ link: A }, { link: B }]);
  assert.deepEqual(linked.waiting, [A, B]);
  assert.deepEqual(
    linked.toFetch.map(({ url }) => url),
    [A],
  );

  await storeResult(ctx, B, PREVIEW_B, 20);
  let message = rows("messages")[0];
  assert.ok(message);
  assert.deepEqual(message.linkPreviews, [
    { link: A },
    { link: B, preview: PREVIEW_B },
  ]);
  // Older apps only show the first link's preview.
  assert.equal(message.linkPreview, undefined);

  await storeResult(ctx, A, PREVIEW_A, 30);
  message = rows("messages")[0];
  assert.ok(message);
  assert.deepEqual(message.linkPreviews, [
    { link: A, preview: PREVIEW_A },
    { link: B, preview: PREVIEW_B },
  ]);
  assert.deepEqual(message.linkPreview, PREVIEW_A);
  assert.equal(rows("linkPreviewWaits").length, 0);
});

void test("cards still waiting give up and show the link", async () => {
  const { ctx, rows } = fakeCtx();
  await insertMessage(ctx, "m1", [A, B], 0);
  await storeResult(ctx, A, PREVIEW_A, 5);
  await giveUp(ctx, "m1");
  assert.deepEqual(rows("messages")[0]?.linkPreviews, [
    { link: A, preview: PREVIEW_A },
    { link: B, preview: null },
  ]);
  assert.equal(rows("linkPreviewWaits").length, 0);
  // A fetch finishing late doesn't change the card it gave up on.
  await storeResult(ctx, B, PREVIEW_B, 50);
  assert.deepEqual(rows("messages")[0]?.linkPreviews, [
    { link: A, preview: PREVIEW_A },
    { link: B, preview: null },
  ]);
});

void test("expired entries are deleted, renewed ones kept", async () => {
  const { ctx, rows } = fakeCtx();
  const first = await storeResult(ctx, A, null, 0);
  await storeResult(ctx, A, PREVIEW_A, MISSING_LIFETIME_MS - 1);
  await expire(ctx, A, first.at);
  assert.equal(rows("linkPreviewCache").length, 1);
  await expire(ctx, A, MISSING_LIFETIME_MS - 1 + PREVIEW_LIFETIME_MS);
  assert.equal(rows("linkPreviewCache").length, 0);
});

void test("a visitor's message fetches nothing: missing links show as links", async () => {
  const { ctx, rows } = fakeCtx();
  await storeResult(ctx, A, PREVIEW_A, 0);
  const linked = await cardsForMessage(ctx, "m1", [A, B], 1, false);
  assert.deepEqual(linked.cards, [
    { link: A, preview: PREVIEW_A },
    { link: B, preview: null },
  ]);
  assert.deepEqual(linked.toFetch, []);
  assert.deepEqual(linked.waiting, []);
  assert.deepEqual(rows("linkPreviewWaits"), []);
});

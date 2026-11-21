import { isPublicWebUrl } from "@decentralized-convex/address";

import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { LinkCard, LinkPreview } from "./protocol.ts";
import { MAX_LINK_LENGTH, MAX_LINK_PREVIEWS } from "./links.ts";

// The link preview cache and the messages waiting on it. Functions here take
// the database and return what to schedule, so they run in tests without
// Convex; `previews.ts` and `conversations.ts` do the scheduling.

/** How long a fetched preview is reused. */
export const PREVIEW_LIFETIME_MS = 6 * 60 * 60 * 1000;
/** How long a link with no preview is left alone before trying again. */
export const MISSING_LIFETIME_MS = 10 * 60 * 1000;
/**
 * How long a fetch may run before another may start. Comfortably over the
 * fetch's own timeout, so it only matters when a fetch died.
 */
export const FETCH_LIFETIME_MS = 30 * 1000;
/** A message stops waiting for its cards after this; they show the link. */
export const GIVE_UP_AFTER_MS = 20 * 1000;

/** An `expire` job to schedule for a cache entry. */
export interface Expiry {
  readonly at: number;
  readonly url: string;
}

/**
 * Whether the server may fetch a link: http(s) on the standard port, to a
 * public host (`fetchPublic` checks each hop's address too).
 */
export { isPublicWebUrl };

/** The links a prefetch may ask about: distinct ones, a few at most. */
function askedUrls(urls: readonly string[]) {
  return [...new Set(urls)]
    .filter((url) => url.length <= MAX_LINK_LENGTH)
    .slice(0, MAX_LINK_PREVIEWS);
}

/** The links of `urls` worth fetching. */
export function fetchableUrls(urls: readonly string[]) {
  return askedUrls(urls).filter((url) => isPublicWebUrl(url));
}

async function cacheEntry(ctx: QueryCtx, url: string) {
  return ctx.db
    .query("linkPreviewCache")
    .withIndex("by_url", (index) => index.eq("url", url))
    .unique();
}

/** Whether a link has a fresh cache entry (or a fetch under way). */
export async function isFresh(ctx: QueryCtx, url: string, now: number) {
  return (await freshEntry(ctx, url, now)) !== null;
}

/** The cached entry for a link, unless it has expired. */
async function freshEntry(ctx: QueryCtx, url: string, now: number) {
  const entry = await cacheEntry(ctx, url);
  return entry !== null && entry.expiresAt > now ? entry : null;
}

function cardFor(
  link: string,
  entry: Doc<"linkPreviewCache"> | null,
): LinkCard {
  // A link the server won't fetch shows as just the link.
  if (!isPublicWebUrl(link)) return { link, preview: null };
  return entry?.preview === undefined
    ? { link }
    : { link, preview: entry.preview };
}

/** What the cache knows about each link, for the `linkPreviews` query. */
export async function cachedCards(
  ctx: QueryCtx,
  urls: readonly string[],
  now: number,
): Promise<LinkCard[]> {
  const links = askedUrls(urls);
  const entries = await Promise.all(
    links.map((url) => freshEntry(ctx, url, now)),
  );
  return links.map((link, index) => cardFor(link, entries[index] ?? null));
}

/**
 * Marks each link without a fresh entry as being fetched. Returns the
 * links to fetch (and their entries' expiry jobs); one already being
 * fetched, or fetched recently, isn't fetched again.
 */
export async function claimFetches(
  ctx: MutationCtx,
  urls: readonly string[],
  now: number,
) {
  const claimed: Expiry[] = [];
  for (const url of urls) {
    const entry = await cacheEntry(ctx, url);
    if (entry !== null && entry.expiresAt > now) continue;
    const expiresAt = now + FETCH_LIFETIME_MS;
    if (entry === null) {
      await ctx.db.insert("linkPreviewCache", { expiresAt, url });
    } else {
      await ctx.db.patch(entry._id, { expiresAt, preview: undefined });
    }
    claimed.push({ at: expiresAt, url });
  }
  return claimed;
}

/**
 * The cards a new message starts with: cached previews where there are
 * some, and placeholders for the rest, which wait on fetches (`toFetch`).
 * Without `fetches`, the rest are just their links.
 */
export async function cardsForMessage(
  ctx: MutationCtx,
  messageId: string,
  links: readonly string[],
  now: number,
  fetches = true,
) {
  const cards: LinkCard[] = [];
  const waiting: string[] = [];
  for (const link of links) {
    const cached = cardFor(link, await freshEntry(ctx, link, now));
    const card =
      cached.preview === undefined && !fetches
        ? { link, preview: null }
        : cached;
    cards.push(card);
    if (card.preview === undefined) {
      waiting.push(link);
      await ctx.db.insert("linkPreviewWaits", { messageId, url: link });
    }
  }
  return { cards, toFetch: await claimFetches(ctx, waiting, now), waiting };
}

/** The legacy single preview: the first link's, once it has one. */
function firstPreview(cards: readonly LinkCard[]) {
  return cards[0]?.preview ?? undefined;
}

/** Fills in a message's waiting card for `link`. */
async function settleCard(
  ctx: MutationCtx,
  messageId: string,
  link: string,
  preview: LinkPreview | null,
) {
  const message = await ctx.db
    .query("messages")
    .withIndex("by_message", (index) => index.eq("messageId", messageId))
    .unique();
  if (message?.linkPreviews === undefined) return;
  const cards = message.linkPreviews.map((card) =>
    card.link === link && card.preview === undefined ? { link, preview } : card,
  );
  await ctx.db.patch(message._id, {
    linkPreview: firstPreview(cards) ?? message.linkPreview,
    linkPreviews: cards,
  });
}

/**
 * Stores a fetch's result and fills in the cards of every message waiting
 * on it. Returns the entry's expiry job.
 */
export async function storeResult(
  ctx: MutationCtx,
  url: string,
  preview: LinkPreview | null,
  now: number,
) {
  const expiresAt =
    now + (preview === null ? MISSING_LIFETIME_MS : PREVIEW_LIFETIME_MS);
  const entry = await cacheEntry(ctx, url);
  if (entry === null) {
    await ctx.db.insert("linkPreviewCache", { expiresAt, preview, url });
  } else {
    await ctx.db.patch(entry._id, { expiresAt, preview });
  }
  const waits = await ctx.db
    .query("linkPreviewWaits")
    .withIndex("by_url", (index) => index.eq("url", url))
    .collect();
  for (const wait of waits) {
    await settleCard(ctx, wait.messageId, url, preview);
    await ctx.db.delete(wait._id);
  }
  return { at: expiresAt, url } satisfies Expiry;
}

/** Gives a message's cards still waiting a link-only card instead. */
export async function giveUp(ctx: MutationCtx, messageId: string) {
  const waits = await ctx.db
    .query("linkPreviewWaits")
    .withIndex("by_message", (index) => index.eq("messageId", messageId))
    .collect();
  for (const wait of waits) {
    await settleCard(ctx, messageId, wait.url, null);
    await ctx.db.delete(wait._id);
  }
}

/** Deletes a link's cache entry if it has expired (it may have been renewed). */
export async function expire(ctx: MutationCtx, url: string, now: number) {
  const entry = await cacheEntry(ctx, url);
  if (entry !== null && entry.expiresAt <= now) await ctx.db.delete(entry._id);
}

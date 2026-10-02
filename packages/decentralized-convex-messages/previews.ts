import { v } from "convex/values";

import type { LinkPreview } from "./protocol.ts";
import { internal } from "./_generated/api.js";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server.js";
import { linkPreview } from "./protocol.ts";

const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_HTML_LENGTH = 512 * 1024;
const MAX_TEXT_LENGTH = 300;

export const messageBody = internalQuery({
  args: { messageId: v.string() },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db
      .query("messages")
      .withIndex("by_message", (index) => index.eq("messageId", messageId))
      .unique();
    return message?.body ?? null;
  },
});

export const setLinkPreview = internalMutation({
  args: { messageId: v.string(), preview: linkPreview },
  handler: async (ctx, { messageId, preview }) => {
    const message = await ctx.db
      .query("messages")
      .withIndex("by_message", (index) => index.eq("messageId", messageId))
      .unique();
    if (message !== null) {
      await ctx.db.patch(message._id, { linkPreview: preview });
    }
  },
});

/** Fetches the first link in a message and stores its Open Graph preview. */
export const unfurl = internalAction({
  args: { messageId: v.string() },
  handler: async (ctx, { messageId }) => {
    const body = await ctx.runQuery(internal.previews.messageBody, {
      messageId,
    });
    const url = body?.match(URL_PATTERN)?.[0]?.replace(/[).,!?]+$/, "");
    if (url === undefined) return;
    try {
      const preview = await fetchPreview(url);
      if (preview !== null) {
        await ctx.runMutation(internal.previews.setLinkPreview, {
          messageId,
          preview,
        });
      }
    } catch (error) {
      console.warn("Link preview failed", url, error);
    }
  },
});

async function fetchPreview(url: string): Promise<LinkPreview | null> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      // Many sites only serve Open Graph tags to crawlers.
      "User-Agent": "Mozilla/5.0 (compatible; VeraBot/1.0; +https://vera.chat)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const finalUrl = response.url || url;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.startsWith("image/")) {
    return { imageUrl: finalUrl, url: finalUrl };
  }
  if (!contentType.includes("html")) return null;
  const html = (await response.text()).slice(0, MAX_HTML_LENGTH);
  return previewFromHtml(html, finalUrl);
}

function previewFromHtml(html: string, url: string): LinkPreview | null {
  const title =
    firstMeta(html, ["og:title", "twitter:title"]) ?? titleTag(html);
  const description = firstMeta(html, [
    "og:description",
    "twitter:description",
    "description",
  ]);
  const image = firstMeta(html, ["og:image", "twitter:image"]);
  const preview: LinkPreview = {
    description: clean(description),
    imageUrl: image === undefined ? undefined : absoluteHttps(image, url),
    siteName: clean(firstMeta(html, ["og:site_name"])) ?? new URL(url).hostname,
    title: clean(title),
    url,
  };
  return preview.title === undefined && preview.imageUrl === undefined
    ? null
    : preview;
}

function firstMeta(html: string, names: readonly string[]) {
  for (const name of names) {
    const content = metaContent(html, name);
    if (content !== undefined) return content;
  }
  return undefined;
}

function metaContent(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (key === undefined || !new RegExp(`^${escaped}$`, "i").test(key)) {
      continue;
    }
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (content !== undefined) return decodeEntities(content);
  }
  return undefined;
}

function titleTag(html: string) {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
  return title === undefined ? undefined : decodeEntities(title);
}

function decodeEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function clean(value: string | undefined) {
  const text = value?.replace(/\s+/g, " ").trim();
  return text === undefined || text.length === 0
    ? undefined
    : text.slice(0, MAX_TEXT_LENGTH);
}

/** Resolves relative image URLs and drops anything not served over https. */
function absoluteHttps(value: string, base: string) {
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

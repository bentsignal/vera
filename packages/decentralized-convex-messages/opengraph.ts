import { fetchPublic, PublicFetchRefused } from "@decentralized-convex/address";

import type { LinkPreview } from "./shapes.ts";
import { LINK_PREVIEW_USER_AGENT, PAGE_AGENTS } from "./agents.ts";
import { isPublicWebUrl } from "./linkCache.ts";
import {
  decodeEntities,
  tidyReddit,
  tweetApiUrl,
  tweetId,
  tweetPreview,
} from "./sites.ts";

// Fetching a link's preview: its page's Open Graph tags, or a tweet.

const FETCH_TIMEOUT_MS = 5_000;
/** All the agents a page is tried as, together, before the card gives up. */
const FETCH_BUDGET_MS = 12_000;
const MAX_HTML_LENGTH = 512 * 1024;
const MAX_TEXT_LENGTH = 300;

/**
 * Titles of the pages bot and login walls show in place of the real one
 * ("Log in or sign up to view" and "Log into Facebook" are Facebook's,
 * "Login • Instagram" Instagram's).
 */
const BLOCKED_TITLE =
  /^(?:just a moment|attention required|access denied|are you a robot|robot check|blocked|please verify|security check|verifying|one more step|pardon our interruption|request rejected|403 forbidden|captcha|log in or sign up|login • instagram|log ?in ?(?:to )?(?:facebook|instagram|linkedin|threads)\b|log ?in$|sign ?in$)/i;

/**
 * What a fetch got: a preview from the page's own tags ("tagged"), one
 * from just its `<title>` (worth keeping only if no agent does better), or
 * nothing.
 */
interface Attempt {
  preview: LinkPreview | null;
  tagged: boolean;
}

export async function fetchPreview(url: string): Promise<LinkPreview | null> {
  if (!isPublicWebUrl(url)) return null;
  const tweet = tweetId(url);
  if (tweet !== undefined) return fetchTweet(tweet);
  const deadline = Date.now() + FETCH_BUDGET_MS;
  let fallback: LinkPreview | null = null;
  for (const agent of PAGE_AGENTS) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    const attempt = await fetchPage(
      url,
      agent,
      Math.min(left, FETCH_TIMEOUT_MS),
    );
    if (attempt.tagged) return attempt.preview;
    fallback ??= attempt.preview;
  }
  return fallback;
}

async function fetchPage(
  url: string,
  agent: string,
  timeout: number,
): Promise<Attempt> {
  const none = { preview: null, tagged: false };
  let response: Response;
  try {
    // Each redirect is checked before it's followed, so a link can't lead
    // the server into the network beside it.
    response = await fetchPublic(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": agent,
      },
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    // Refused: no agent gets further.
    if (error instanceof PublicFetchRefused) throw error;
    // Timed out or turned away: the next agent may do better.
    return none;
  }
  return readPage(response, url);
}

async function readPage(response: Response, url: string): Promise<Attempt> {
  const none = { preview: null, tagged: false };
  const finalUrl = response.url || url;
  // A redirect into the local network gets nothing back from it.
  if (!response.ok || !isPublicWebUrl(finalUrl)) {
    await response.body?.cancel();
    return none;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.startsWith("image/")) {
    await response.body?.cancel();
    return { preview: { imageUrl: finalUrl, url: finalUrl }, tagged: true };
  }
  if (!contentType.includes("html")) {
    await response.body?.cancel();
    return none;
  }
  const html = await readHead(response, contentType);
  return previewFromHtml(html, finalUrl);
}

/**
 * x.com sends crawlers a page with no tweet in it, so a tweet comes from
 * the API Twitter's embeds use, which has its video too.
 */
async function fetchTweet(id: string): Promise<LinkPreview | null> {
  const response = await fetch(tweetApiUrl(id), {
    headers: {
      Accept: "application/json",
      "User-Agent": LINK_PREVIEW_USER_AGENT,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  // A deleted or protected tweet is a 404 or an empty object.
  if (!response.ok) {
    await response.body?.cancel();
    return null;
  }
  const preview = tweetPreview(await response.json());
  return preview === null
    ? null
    : {
        ...preview,
        // Already tidy, line breaks and all (see `tweetText`).
        description: preview.description?.slice(0, MAX_TEXT_LENGTH),
        title: clean(preview.title),
      };
}

/** A decoder for the page's charset, or UTF-8. */
function decoderFor(contentType: string) {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  try {
    return new TextDecoder(charset);
  } catch {
    return new TextDecoder();
  }
}

/**
 * The page up to the end of its `<head>`, where the tags are, reading no
 * more than `MAX_HTML_LENGTH`.
 */
async function readHead(response: Response, contentType: string) {
  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined =
    response.body?.getReader();
  if (reader === undefined) return "";
  const decoder = decoderFor(contentType);
  let html = "";
  while (html.length < MAX_HTML_LENGTH) {
    const chunk: { done: boolean; value?: Uint8Array } = await reader.read();
    if (chunk.done || chunk.value === undefined) break;
    const searched = Math.max(0, html.length - "</head>".length);
    html += decoder.decode(chunk.value, { stream: true });
    if (/<\/head>/i.test(html.slice(searched))) break;
  }
  await reader.cancel();
  return html.slice(0, MAX_HTML_LENGTH);
}

/** A page's preview from its tags; see `Attempt`. */
export function previewFromHtml(html: string, url: string): Attempt {
  const tags = metaTags(html);
  const title = first(tags, ["og:title", "twitter:title"]);
  const image = first(tags, [
    "og:image",
    "og:image:url",
    "og:image:secure_url",
    "twitter:image",
    "twitter:image:src",
  ]);
  const shown = clean(title ?? titleTag(html));
  if (shown !== undefined && BLOCKED_TITLE.test(shown)) {
    return { preview: null, tagged: false };
  }
  const preview = tidyReddit({
    description: clean(
      first(tags, ["og:description", "twitter:description", "description"]),
    ),
    imageUrl:
      image === undefined ? imageLink(html, url) : absoluteHttps(image, url),
    siteName: clean(first(tags, ["og:site_name"])) ?? new URL(url).hostname,
    title: shown,
    url,
  });
  if (preview.title === undefined && preview.imageUrl === undefined) {
    return { preview: null, tagged: false };
  }
  return { preview, tagged: title !== undefined || image !== undefined };
}

/** Every `<meta>` tag's content, by its lowercased property or name. */
function metaTags(html: string) {
  const tags = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = attribute(tag, "property") ?? attribute(tag, "name");
    const content = attribute(tag, "content");
    if (key === undefined || content === undefined) continue;
    const name = key.toLowerCase();
    // The first of a name wins, as for crawlers.
    if (!tags.has(name)) tags.set(name, decodeEntities(content));
  }
  return tags;
}

/** An attribute's value, quoted either way (an apostrophe inside double quotes is text). */
function attribute(tag: string, name: string) {
  const match = new RegExp(
    `\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    "i",
  ).exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function first(tags: ReadonlyMap<string, string>, names: readonly string[]) {
  for (const name of names) {
    const content = tags.get(name);
    if (content !== undefined && content.trim().length > 0) return content;
  }
  return undefined;
}

function titleTag(html: string) {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
  return title === undefined ? undefined : decodeEntities(title);
}

/** `<link rel="image_src">`, which some pages give in place of `og:image`. */
function imageLink(html: string, url: string) {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const href = attribute(tag, "href");
    if (attribute(tag, "rel")?.toLowerCase() === "image_src" && href) {
      return absoluteHttps(decodeEntities(href), url);
    }
  }
  return undefined;
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

import { textParts } from "@decentralized-convex/messages";

import type { ProfileOf } from "../conversation/message-row";
import type {
  LinkPreview,
  Message,
  MessageAttachment,
} from "../conversation/types.ts";
import type { ReactionPart } from "../messaging/reaction-part.ts";
import type { ReactionSummary } from "../messaging/reactions";
import type {
  Block,
  FooterLine,
  MediaItem,
  Person,
  Reaction,
  Span,
} from "./contract.ts";
import type { MessageLayout } from "~/features/preferences/store";
import { formatBytes } from "../../lib/format.ts";
import { initials } from "../../lib/initials.ts";
import { mentionRanges } from "../conversation/mention-text.ts";
import { linkPart } from "../conversation/message-parts.ts";
import { linkCardsOf, visibleBody } from "../conversation/message-text.ts";
import { quoteText } from "../conversation/reply-parts.ts";
import { attachmentPart, parsePart } from "../messaging/reaction-part.ts";
import { isJumbo } from "./jumbo.ts";

// A message's parts as the native list's blocks (see contract.ts), in the
// order the React Native list draws them, with each part's reactions.

export const DELETED_TEXT = "This message was deleted";
/** "Not sent", under a message that failed. */
export const NOT_SENT_TEXT = "Not sent. Tap to try again.";
/** A photo or video whose message doesn't know its size draws square. */
const UNKNOWN_SIZE = 1000;

export function personOf(address: string, profileOf: ProfileOf) {
  const { avatarUrl, displayName } = profileOf(address);
  return {
    avatarUrl,
    id: address,
    initials: initials(displayName),
    name: displayName,
  } satisfies Person;
}

/** A part as the contract carries it: text (see `parsePart`). */
export function partId(part: ReactionPart) {
  return String(part);
}

/**
 * A reaction's key on the native side: its part and emoji, so a tap on a
 * row's reactions says which part it was on.
 */
export function reactionKey(part: string, emoji: string) {
  return `${part} ${emoji}`;
}

/** A reaction key read back (see `reactionKey`). */
export function parseReactionKey(key: string) {
  const space = key.indexOf(" ");
  if (space === -1) return { emoji: key, part: parsePart("message") };
  return {
    emoji: key.slice(space + 1),
    part: parsePart(key.slice(0, space)),
  };
}

/** The reactions on `parts` of a message, as the contract's. */
export function reactionsFor(
  reactions: readonly ReactionSummary[] | undefined,
  parts: ReadonlySet<string>,
) {
  return (reactions ?? [])
    .filter((reaction) => parts.has(partId(reaction.part)))
    .map(
      (reaction): Reaction => ({
        content: { emoji: reaction.emoji },
        count: reaction.count,
        key: reactionKey(partId(reaction.part), reaction.emoji),
        mine: reaction.mine,
      }),
    );
}

/** Text with its @mentions and links as spans. */
export function spansOf(text: string, mentions: Message["mentions"]) {
  const spans = new Array<Span>();
  function plain(from: number, to: number) {
    for (const part of textParts(text.slice(from, to))) {
      spans.push(
        part.url === undefined
          ? { text: part.text }
          : { style: "link", text: part.text, url: part.url },
      );
    }
  }
  let at = 0;
  for (const range of mentionRanges(text, mentions)) {
    plain(at, range.start);
    spans.push({
      accountId: range.accountId,
      style: "mention",
      text: text.slice(range.start, range.end),
    });
    at = range.end;
  }
  plain(at, text.length);
  return spans;
}

export function isStuck(attachment: MessageAttachment) {
  const state = attachment.upload?.state;
  return state === "failed" || state === "too-large";
}

/** A photo's or video's size, square when its message doesn't say. */
function sizeOf({ height = 0, width = 0 }: MessageAttachment) {
  return width > 0 && height > 0
    ? { height, width }
    : { height: UNKNOWN_SIZE, width: UNKNOWN_SIZE };
}

/** What shows before a photo or video loads: a video's poster. */
function posterOf(attachment: MessageAttachment) {
  if (attachment.kind !== "video") return attachment.thumbnailUrl;
  return attachment.localThumbnailUrl ?? attachment.thumbnailUrl;
}

function durationOf({ durationMs }: MessageAttachment) {
  return durationMs === undefined ? undefined : durationMs / 1000;
}

function mediaItem(
  message: Message,
  attachment: MessageAttachment,
  index: number,
) {
  const part = partId(attachmentPart(message, index));
  return {
    ...sizeOf(attachment),
    durationSeconds: durationOf(attachment),
    id: attachment.localUrl ?? attachment.url,
    kind: attachment.kind === "video" ? "video" : "image",
    localUrl: attachment.localUrl,
    part,
    reactions: reactionsFor(message.reactions, new Set([part])),
    thumbnailUrl: posterOf(attachment),
    uploading: attachment.upload?.state === "uploading",
    url: attachment.url,
  } satisfies MediaItem;
}

function fileBlock(
  message: Message,
  attachment: MessageAttachment,
  index: number,
) {
  return {
    name: attachment.name,
    part: partId(attachmentPart(message, index)),
    sizeLabel: isStuck(attachment)
      ? "Not uploaded. Tap to retry."
      : formatBytes(attachment.size),
    type: "file",
    url: attachment.url,
  } satisfies Block;
}

/**
 * A message's attachments as blocks: all of its photos and videos in one
 * media block where the first of them is, its files in place around it.
 */
function attachmentBlocks(message: Message) {
  const media = message.attachments.flatMap((attachment, index) =>
    attachment.kind === "file" ? [] : [mediaItem(message, attachment, index)],
  );
  const firstMedia = message.attachments.findIndex(
    (attachment) => attachment.kind !== "file",
  );
  // One photo or video alone is the block's own part.
  const part = media.length === 1 ? media[0]?.part : undefined;
  return message.attachments.flatMap((attachment, index): Block[] => {
    if (attachment.kind === "file") {
      return [fileBlock(message, attachment, index)];
    }
    return index === firstMedia ? [{ items: media, part, type: "media" }] : [];
  });
}

function hostOf(link: string) {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

/** What a link's preview shows on its card, once it has one. */
function previewOf(preview: LinkPreview | null | undefined) {
  if (preview === null || preview === undefined) return {};
  return {
    description: preview.description,
    imageHeight: preview.video?.height,
    imageUrl: preview.imageUrl,
    imageWidth: preview.video?.width,
    site: preview.siteName,
    title: preview.title,
  };
}

function linkCardBlocks(message: Message) {
  return linkCardsOf(message).map((card, index): Block => {
    const preview = previewOf(card.preview);
    return {
      ...preview,
      part: linkPart(message, index),
      site: preview.site ?? hostOf(card.link),
      type: "linkCard",
      url: card.link,
    };
  });
}

function textBlocks(message: Message) {
  const body = visibleBody(message);
  if (body === undefined) return [];
  return [
    {
      jumbo: isJumbo(body) ? true : undefined,
      part: "message",
      spans: spansOf(body, message.mentions),
      type: "text",
    },
  ] satisfies Block[];
}

/** A small picture of what a quoted message sent. */
function quoteThumbnail(attachment: MessageAttachment | undefined) {
  if (attachment?.kind === "image") {
    return attachment.thumbnailUrl ?? attachment.url;
  }
  return attachment?.thumbnailUrl;
}

function quoteBlocks(message: Message, profileOf: ProfileOf) {
  const { quote } = message;
  if (quote === undefined) return [];
  return [
    {
      author: personOf(quote.authorId, profileOf),
      messageId: quote.messageId ?? message.threadId ?? "",
      text: quoteText(quote),
      thumbnailUrl:
        quote.deleted === true ? undefined : quoteThumbnail(quote.attachment),
      type: "quote",
    },
  ] satisfies Block[];
}

/**
 * A message's blocks, top to bottom. Bubbles put its photos over its text,
 * stacked rows its text first; link cards come last, a reply's quote first.
 */
export function blocksOf(
  message: Message,
  layout: MessageLayout,
  profileOf: ProfileOf,
) {
  if (message.deleted === true) {
    return [{ label: DELETED_TEXT, type: "deleted" }] satisfies Block[];
  }
  const middle =
    layout === "bubbles"
      ? [...attachmentBlocks(message), ...textBlocks(message)]
      : [...textBlocks(message), ...attachmentBlocks(message)];
  return [
    ...quoteBlocks(message, profileOf),
    ...middle,
    ...linkCardBlocks(message),
  ];
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * A thread's count: "View 2 more replies" under a reply in the
 * conversation, "3 replies" under a thread's original.
 */
function repliesLine(message: Message, profileOf: ProfileOf) {
  const { thread } = message;
  if (thread === undefined) return [];
  const people = thread.repliers.map((address) => personOf(address, profileOf));
  if (message.quote !== undefined) {
    const more = thread.replyCount - 1;
    if (more <= 0) return [];
    const text = `View ${plural(more, "more reply", "more replies")}`;
    return [{ kind: "replies", people, text }] satisfies FooterLine[];
  }
  if (message.threadId !== undefined) return [];
  const text = plural(thread.replyCount, "reply", "replies");
  return [{ kind: "replies", people, text }] satisfies FooterLine[];
}

/** The lines under a message: its thread's count, "Edited", "Not sent". */
export function footerOf(message: Message, profileOf: ProfileOf) {
  const edited = message.editedAt !== undefined && message.deleted !== true;
  return [
    ...repliesLine(message, profileOf),
    ...(edited ? [{ kind: "edited", text: "Edited" } as const] : []),
    ...(message.status === "failed"
      ? [{ kind: "notSent", text: NOT_SENT_TEXT } as const]
      : []),
  ] satisfies FooterLine[];
}

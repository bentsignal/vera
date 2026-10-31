import type { MessageRow as BuiltRow } from "../conversation/build-rows.ts";
import type {
  Message,
  MemberNotice as Notice,
  ProfileOf,
} from "../conversation/types.ts";
import type {
  Block,
  FooterLine,
  HeaderRow,
  MessageRow,
  Person,
  Reaction,
  Row,
  Span,
} from "./contract.ts";
import type { MessageLayout } from "~/features/preferences/store";
import {
  formatDaySeparator,
  formatMessageTime,
  formatTime,
  formatTimeHeader,
} from "../../lib/format.ts";
import { arrivedAfter } from "../conversation/build-rows.ts";
import { linkPart } from "../conversation/message-parts.ts";
import { linkCardsOf, visibleBody } from "../conversation/message-text.ts";
import { quoteText } from "../conversation/reply-parts.ts";
import { attachmentPart } from "../messaging/reaction-part.ts";
import { typingLabel } from "../messaging/typing-state.ts";
import {
  blocksOf,
  DELETED_TEXT,
  footerOf,
  partId,
  personOf,
  reactionsFor,
} from "./map-blocks.ts";

// The app's messages, notices, and who's typing as the native list's rows
// (see contract.ts): newest first, built from the same rows the React
// Native list shows (`newestFirst` in build-rows.ts), with the same labels.

export { parseReactionKey, reactionKey, spansOf } from "./map-blocks.ts";

/** What the rows depend on besides the messages. */
export interface RowContext {
  readonly self: string;
  readonly layout: MessageLayout;
  /** Group chats, where incoming runs show their sender. */
  readonly showAuthors: boolean;
  /**
   * A direct message's two members. Anyone else there, such as Vera called
   * in by an @mention, shows their name even without `showAuthors`.
   */
  readonly members?: readonly string[];
  readonly profileOf: ProfileOf;
  /** What the installed binary draws (see `nativeSupport`). */
  readonly support: Support;
  /** When the conversation opened: rows after it arrived while open. */
  readonly openedAt: number;
  /** The message it opened on, tinted. */
  readonly anchorId?: string;
  /** For "Today" and "Yesterday"; now by default. */
  readonly now?: Date;
}

/** The row kinds and block types a binary draws. */
export interface Support {
  readonly rowKinds: readonly string[];
  readonly blockTypes: readonly string[];
}

/** The ID of the typing row, which is always the newest. */
export const TYPING_ROW_ID = "typing";

function counted(amount: number, one: string, many: string) {
  return amount === 1 ? one : `${amount} ${many}`;
}

/** What a message sent besides text, in words. */
function attachmentWords(message: Message) {
  const { attachments } = message;
  const photos = attachments.filter((item) => item.kind === "image").length;
  const videos = attachments.filter((item) => item.kind === "video").length;
  return [
    ...(photos > 0 ? [counted(photos, "Photo", "photos")] : []),
    ...(videos > 0 ? [counted(videos, "Video", "videos")] : []),
    ...attachments
      .filter((item) => item.kind === "file")
      .map((file) => `File: ${file.name}`),
  ];
}

/** A message in words: its text, or what it sent instead. */
export function summaryOf(message: Message) {
  if (message.deleted === true) return DELETED_TEXT;
  const body = visibleBody(message);
  const words = [
    ...(body === undefined ? [] : [body]),
    ...attachmentWords(message),
    ...linkCardsOf(message).map((card) => card.preview?.title ?? card.link),
  ];
  return words.length > 0 ? words.join(", ") : "Message";
}

function reactionWords(reactions: readonly Reaction[]) {
  return reactions.map((reaction) => {
    const content =
      "emoji" in reaction.content
        ? reaction.content.emoji
        : reaction.content.label;
    return `${content} ${reaction.count}`;
  });
}

/** The whole message read out, for VoiceOver and TalkBack. */
function accessibilityLabelOf({
  message,
  author,
  reactions,
  footer,
  now,
}: {
  message: Message;
  author: Person;
  reactions: readonly Reaction[];
  footer: readonly FooterLine[];
  now: Date | undefined;
}) {
  const quoted =
    message.quote === undefined ? [] : [`Reply to ${quoteText(message.quote)}`];
  return [
    author.name,
    ...quoted,
    summaryOf(message),
    formatMessageTime(message.sentAt, now, ", "),
    ...reactionWords(reactions),
    ...footer.map((line) => line.text),
  ].join(", ");
}

/**
 * The parts of a message whose reactions show on its row: all but its
 * photos and videos, which have their own.
 */
function rowParts(message: Message) {
  const parts = new Set(["message"]);
  message.attachments.forEach((attachment, index) => {
    if (attachment.kind === "file") {
      parts.add(partId(attachmentPart(message, index)));
    }
  });
  linkCardsOf(message).forEach((_, index) =>
    parts.add(linkPart(message, index)),
  );
  message.attachments.forEach((attachment, index) => {
    if (attachment.kind !== "file") {
      parts.delete(partId(attachmentPart(message, index)));
    }
  });
  return parts;
}

function messageRow(
  row: Extract<BuiltRow, { type: "message" }>,
  context: RowContext,
) {
  const { message } = row;
  const { layout, profileOf, self, showAuthors } = context;
  const isOwn = message.authorId === self;
  const author = personOf(message.authorId, profileOf);
  const reactions = reactionsFor(message.reactions, rowParts(message));
  const footer = footerOf(message, profileOf);
  return {
    accessibilityLabel: accessibilityLabelOf({
      message,
      author,
      reactions,
      footer,
      now: context.now,
    }),
    arrived: arrivedAfter(row, context.openedAt) ? true : undefined,
    author,
    blocks: blocksOf(message, layout, profileOf),
    endsGroup: row.endsGroup,
    fallbackText: `${author.name}: ${summaryOf(message)}`,
    footer,
    highlighted: row.key === context.anchorId ? true : undefined,
    id: row.key,
    isOwn,
    kind: "message",
    layout,
    reactions,
    sentAt: message.sentAt.getTime(),
    showAuthor:
      layout === "stacked" ||
      (!isOwn && (showAuthors || isGuest(message.authorId, context))),
    startsGroup: row.startsGroup,
    status: message.status,
    // Stacked rows show it beside the name. Bubbles reveal it in a narrow
    // column beside headers that already give the day, so only the time.
    timeLabel:
      layout === "stacked"
        ? formatMessageTime(message.sentAt, context.now)
        : formatTime(message.sentAt),
  } satisfies MessageRow;
}

/** "Maya joined the conversation". */
function noticeSpans(notice: Notice) {
  const joined = notice.kind === "joined";
  return [
    { style: "bold", text: notice.name },
    { text: joined ? " joined the conversation" : " left the conversation" },
  ] satisfies Span[];
}

function headerRow(id: string, label: string, style: HeaderRow["style"]) {
  return {
    fallbackText: label,
    id,
    kind: "header",
    label,
    style,
  } satisfies Row;
}

/** One built row as the native list's row. */
function nativeRow(built: BuiltRow, context: RowContext) {
  switch (built.type) {
    case "message":
      return messageRow(built, context);
    case "notice": {
      const spans = noticeSpans(built.notice);
      const fallbackText = spans.map((span) => span.text).join("");
      return {
        fallbackText,
        id: built.key,
        kind: "notice",
        spans,
      } satisfies Row;
    }
    // A thread's divider under its original (`RepliesDivider`).
    case "replies":
      return headerRow(
        built.key,
        built.count === 0
          ? "No replies yet"
          : counted(built.count, "1 reply", "replies"),
        "replies",
      );
    case "day":
      return headerRow(
        built.key,
        formatDaySeparator(built.date, context.now),
        "day",
      );
    case "time": {
      const { day, time } = formatTimeHeader(built.date, context.now);
      return headerRow(built.key, `${day} · ${time}`, "time");
    }
  }
}

/** Whether someone isn't one of a direct message's members (`members`). */
function isGuest(accountId: string, { members }: RowContext) {
  return members !== undefined && !members.includes(accountId);
}

/** Who's typing, as the newest row; none when nobody is. */
function typingRow(typists: readonly string[], context: RowContext) {
  if (typists.length === 0) return [];
  const people = typists.map((address) => personOf(address, context.profileOf));
  const label = typingLabel(people.map((person) => person.name));
  return [
    {
      fallbackText: label,
      id: TYPING_ROW_ID,
      kind: "typing",
      label,
      layout: context.layout,
      people,
      // Stacked rows always show the photos, one-on-one too, as the React
      // Native list's typing line does; bubbles only where messages show
      // who sent them, not one-on-one.
      showFaces:
        context.layout === "stacked" ||
        context.showAuthors ||
        typists.some((address) => isGuest(address, context)),
    },
  ] satisfies Row[];
}

function mediaText(items: readonly { readonly kind: string }[]) {
  if (items.length !== 1) return `${items.length} photos and videos`;
  return items[0]?.kind === "video" ? "Video" : "Photo";
}

/** A block's text, for a binary that can't draw it. */
function blockText(block: Block) {
  switch (block.type) {
    case "text":
      return block.spans.map((span) => span.text).join("");
    case "media":
      return mediaText(block.items);
    case "file":
      return `File: ${block.name}`;
    case "linkCard":
      return block.title ?? block.url;
    case "quote":
      return `Reply to ${block.author.name}: ${block.text}`;
    case "deleted":
      return block.label;
  }
}

/** A message's blocks, with any this binary can't draw as their text. */
function supportedBlocks(blocks: readonly Block[], support: Support) {
  const types = new Set(support.blockTypes);
  const canText = types.has("text");
  return blocks.flatMap((block): Block[] => {
    if (types.has(block.type)) return [block];
    if (!canText) return [];
    return [
      { part: block.part, spans: [{ text: blockText(block) }], type: "text" },
    ];
  });
}

/**
 * The row as this binary can draw it: a block it doesn't know becomes its
 * text, and a row kind it doesn't know becomes a `custom` row of its
 * `fallbackText`.
 */
export function supported(row: Row, support: Support) {
  if (!support.rowKinds.includes(row.kind)) {
    return {
      component: row.kind,
      fallbackText: row.fallbackText ?? "",
      id: row.id,
      kind: "custom",
    } satisfies Row;
  }
  if (row.kind !== "message") return row;
  return {
    ...row,
    blocks: supportedBlocks(row.blocks, support),
  } satisfies Row;
}

/**
 * The native list's rows, newest first: who's typing, then `rows` (from
 * `newestFirst`).
 */
export function nativeRows(
  rows: readonly BuiltRow[],
  typists: readonly string[],
  context: RowContext,
) {
  return [
    ...typingRow(typists, context),
    ...rows.map((row) => nativeRow(row, context)),
  ].map((row) => supported(row, context.support));
}

import type {
  FooterLine,
  MessageRow,
  Person,
  Reaction,
  Row,
  Theme,
} from "./contract";
import {
  blocksFor,
  line,
  mod,
  PEOPLE,
  person,
  thumbs,
  UNKNOWN_BLOCK,
} from "./dev-fixture-blocks";
import { FIXTURE_THEME } from "./fixtures";

// Made-up rows for `/dev-native-list`, richer than fixtures.ts: runs of
// messages by the same person, every block type, videos, uploads, a failed
// send, a custom row, an unknown block, a dark theme, and a media-heavy
// mode for flinging through hundreds of photos.

export { PEOPLE };

interface MessageOptions {
  readonly arrived?: boolean;
  readonly heavy?: boolean;
  readonly author?: Person;
}

function footerFor(index: number, failed: boolean) {
  if (failed) {
    return [
      { kind: "notSent", text: "Not sent. Tap to try again." },
    ] satisfies FooterLine[];
  }
  if (mod(index, 11) === 3) {
    return [
      { kind: "replies", people: [person(1), person(2)], text: "2 replies" },
    ] satisfies FooterLine[];
  }
  if (mod(index, 13) === 5) {
    return [{ kind: "edited", text: "Edited" }] satisfies FooterLine[];
  }
  return [];
}

function reactionsFor(index: number) {
  if (mod(index, 4) === 1) {
    return [
      thumbs(2, mod(index, 8) === 1),
      { content: { emoji: "❤️" }, count: 1, key: "❤️", mine: false },
    ] satisfies Reaction[];
  }
  if (mod(index, 23) === 7) {
    return [
      { content: { emoji: "😂" }, count: 3, key: "😂", mine: true },
      { content: { emoji: "🔥" }, count: 2, key: "🔥", mine: false },
    ] satisfies Reaction[];
  }
  return [];
}

/** A message, `index` back from the newest (arrivals are negative). */
export function devMessage(
  index: number,
  layout: "bubbles" | "stacked",
  sentAt: number,
  options: MessageOptions = {},
) {
  const heavy = options.heavy === true;
  // Runs of two by the same person, then someone else.
  const author = options.author ?? person(Math.floor(index / 2));
  const failed = !heavy && mod(index, 29) === 15;
  const unknown = !heavy && mod(index, 17) === UNKNOWN_BLOCK;
  return {
    accessibilityLabel: `${author.name}: ${line(index)}`,
    arrived: options.arrived === true,
    author,
    blocks: blocksFor(index, heavy),
    endsGroup: true,
    fallbackText: unknown ? "A poll: update Vera to see it" : undefined,
    footer: footerFor(index, failed),
    highlighted: index === 30,
    id: `m${index}`,
    isOwn: author.id === "me",
    kind: "message",
    layout,
    reactions: reactionsFor(index),
    sentAt,
    showAuthor: layout === "stacked" || author.id !== "me",
    startsGroup: true,
    status: failed ? "failed" : index === 1 && !heavy ? "sending" : undefined,
    timeLabel: new Date(sentAt).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }),
  } satisfies MessageRow;
}

/** A header or notice goes above these messages, ending a run. */
function breaksAbove(index: number) {
  return mod(index, 12) === 11 || mod(index, 37) === 20;
}

/** What goes above the message `index` back: a header, notice, or custom row. */
function extrasAbove(
  index: number,
  message: MessageRow,
  layout: "bubbles" | "stacked",
  heavy: boolean,
) {
  const extras = new Array<Row>();
  if (mod(index, 12) === 11) {
    extras.push({
      id: `h${index}`,
      kind: "header",
      label: `Today ${message.timeLabel}`,
      style: layout === "bubbles" ? "time" : "day",
    });
  }
  if (mod(index, 37) === 20) {
    extras.push({
      id: `n${index}`,
      kind: "notice",
      spans: [
        { style: "bold", text: "Leo" },
        { text: " joined the conversation" },
      ],
    });
  }
  if (mod(index, 41) === 25 && !heavy) {
    extras.push({
      component: "Poll",
      fallbackText: "A poll: update Vera to see it",
      id: `c${index}`,
      kind: "custom",
    });
  }
  return extras;
}

/** `count` rows, newest first, starting `from` messages back. */
export function devRows(
  count: number,
  from: number,
  layout: "bubbles" | "stacked",
  heavy = false,
) {
  const now = Date.now();
  const messages = Array.from({ length: count }, (_, position) =>
    devMessage(from + position, layout, now - (from + position) * 420_000, {
      heavy,
    }),
  );
  return messages.flatMap((message, position) => {
    const index = from + position;
    const newer = messages[position - 1];
    const older = messages[position + 1];
    const startsGroup =
      breaksAbove(index) || older?.author.id !== message.author.id;
    const endsGroup =
      breaksAbove(index - 1) || newer?.author.id !== message.author.id;
    return [
      { ...message, endsGroup, startsGroup },
      ...extrasAbove(index, message, layout, heavy),
    ];
  });
}

export function devTyping(layout: "bubbles" | "stacked", count: 1 | 2) {
  return {
    id: "typing",
    kind: "typing",
    label: count === 1 ? "Maya is typing" : "Maya and Priya are typing",
    layout,
    people: count === 1 ? [person(0)] : [person(0), person(2)],
  } satisfies Row;
}

/** The dark theme (global.css's dark variant). */
export const DEV_THEME_DARK = {
  ...FIXTURE_THEME,
  colors: {
    accent: "#0a84ff",
    background: "#000000",
    backgroundElevated: "#1c1c1e",
    bubbleIncoming: "#26252a",
    bubbleOutgoing: "#0a84ff",
    destructive: "#ff453a",
    fill: "rgba(118, 118, 128, 0.24)",
    foreground: "#ffffff",
    highlight: "rgba(124, 124, 255, 0.18)",
    monogramBottom: "#858994",
    monogramTop: "#a6abb8",
    muted: "rgba(235, 235, 245, 0.6)",
    onAccent: "#ffffff",
    separator: "rgba(84, 84, 88, 0.65)",
    subtle: "rgba(235, 235, 245, 0.3)",
    textIncoming: "#ffffff",
    textOutgoing: "#ffffff",
  },
} satisfies Theme;

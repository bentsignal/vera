import type {
  Behavior,
  Block,
  MediaItem,
  MessageRow,
  Person,
  Reaction,
  Row,
  Theme,
} from "./contract";

// Made-up rows for building and checking the native list on its own
// (`/dev-native-list`), before the app's messages are mapped to it: every
// row kind and block type, both layouts, in a varied mix like a real
// group chat (photos, videos, link cards, reactions).

const PEOPLE = [
  { avatarUrl: null, id: "maya", initials: "MC", name: "Maya Chen" },
  { avatarUrl: null, id: "jonah", initials: "JW", name: "Jonah Weiss" },
  {
    avatarUrl: "https://picsum.photos/id/64/200/200",
    id: "priya",
    initials: "PN",
    name: "Priya Natarajan",
  },
  { avatarUrl: null, id: "me", initials: "ME", name: "Me" },
] satisfies Person[];

const ME = { avatarUrl: null, id: "me", initials: "ME", name: "Me" };

/** Someone from `PEOPLE`, by index. */
function person(index: number) {
  return PEOPLE[index] ?? ME;
}

const LINES = [
  "Is anyone around this weekend?",
  "Probably, depends on the weather",
  "I'm in",
  "Count me in too, I can bring snacks and the speaker. Also the folding chairs if we're doing the park again, they're still in my trunk from last time",
  "lol",
  "😂😂",
  "Did you see this?",
  "That's wild",
  "Running ten minutes late, sorry",
  "Same",
];

function photo(seed: number, index: number, width = 1200, height = 900) {
  return {
    height,
    id: `p${seed}-${index}`,
    kind: "image",
    part: `attachment:p${seed}-${index}`,
    reactions: index === 1 ? [thumbs(1, false)] : [],
    thumbnailUrl: `https://picsum.photos/id/${(seed * 7 + index) % 80}/${Math.round(width / 3)}/${Math.round(height / 3)}`,
    url: `https://picsum.photos/id/${(seed * 7 + index) % 80}/${width}/${height}`,
    width,
  } satisfies MediaItem;
}

function thumbs(count: number, mine: boolean) {
  return {
    content: { emoji: "👍" },
    count,
    key: "👍",
    mine,
  } satisfies Reaction;
}

function blocksFor(index: number) {
  const text = LINES[index % LINES.length] ?? "";
  switch (index % 9) {
    case 2:
      return [
        {
          items: [photo(index, 0)],
          part: `attachment:p${index}-0`,
          type: "media",
        },
      ] satisfies Block[];
    case 4:
      return [
        { spans: [{ text }], type: "text", part: "message" },
        {
          items: [0, 1, 2, 3].map((item) =>
            photo(index, item, 900 + item * 100, 1200),
          ),
          type: "media",
        },
      ] satisfies Block[];
    case 5:
      return [
        {
          spans: [
            { text: "Look at this " },
            {
              style: "link",
              text: "youtube.com/watch?v=x",
              url: "https://youtube.com",
            },
          ],
          type: "text",
          part: "message",
        },
        {
          description: "A video everyone needs to see",
          imageHeight: 360,
          imageUrl: "https://picsum.photos/id/20/640/360",
          imageWidth: 640,
          site: "youtube.com",
          title: "The best video",
          type: "linkCard",
          url: "https://youtube.com",
        },
      ] satisfies Block[];
    case 6:
      return [
        {
          jumbo: true,
          spans: [{ text: "😂😂" }],
          type: "text",
          part: "message",
        },
      ] satisfies Block[];
    case 7:
      return [
        {
          author: person(0),
          messageId: "quoted",
          text: "Is anyone around this weekend?",
          type: "quote",
        },
        {
          spans: [
            { text: "Me! " },
            { accountId: "maya", style: "mention", text: "@Maya" },
          ],
          type: "text",
          part: "message",
        },
      ] satisfies Block[];
    case 8:
      return [
        {
          name: "plans.pdf",
          sizeLabel: "2.4 MB",
          type: "file",
          url: "https://example.com",
          part: "attachment:f",
        },
      ] satisfies Block[];
    default:
      return [
        { spans: [{ text }], type: "text", part: "message" },
      ] satisfies Block[];
  }
}

/** A message, `index` back from the newest. */
export function fixtureMessage(
  index: number,
  layout: "bubbles" | "stacked",
  sentAt: number,
  arrived = false,
) {
  const author = person(index % 3 === 0 ? 3 : index % 3);
  const blocks = blocksFor(index);
  return {
    accessibilityLabel: `${author.name}: ${LINES[index % LINES.length] ?? ""}`,
    arrived,
    author,
    blocks,
    endsGroup: true,
    footer:
      index % 11 === 3
        ? [{ kind: "replies", people: [person(1)], text: "2 replies" }]
        : index % 13 === 5
          ? [{ kind: "edited", text: "Edited" }]
          : [],
    id: `m${index}`,
    isOwn: author.id === "me",
    kind: "message",
    layout,
    reactions:
      index % 4 === 1
        ? [
            thumbs(2, index % 8 === 1),
            { content: { emoji: "❤️" }, count: 1, key: "❤️", mine: false },
          ]
        : [],
    sentAt,
    showAuthor: layout === "stacked" || author.id !== "me",
    startsGroup: true,
    timeLabel: new Date(sentAt).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }),
  } satisfies MessageRow;
}

/** `count` rows, newest first, starting `from` messages back. */
export function fixtureRows(
  count: number,
  from: number,
  layout: "bubbles" | "stacked",
) {
  const now = Date.now();
  const rows = new Array<Row>();
  for (let index = from; index < from + count; index += 1) {
    const sentAt = now - index * 7 * 60_000;
    rows.push(fixtureMessage(index, layout, sentAt));
    if (index % 12 === 11) {
      rows.push({
        id: `h${index}`,
        kind: "header",
        label: new Date(sentAt).toLocaleString(),
        style: layout === "bubbles" ? "time" : "day",
      });
    }
    if (index % 37 === 20) {
      rows.push({
        id: `n${index}`,
        kind: "notice",
        spans: [
          { style: "bold", text: "Leo" },
          { text: " joined the conversation" },
        ],
      });
    }
  }
  return rows;
}

export const FIXTURE_TYPING = {
  id: "typing",
  kind: "typing",
  label: "Maya is typing",
  layout: "bubbles",
  people: [person(0)],
} satisfies Row;

/** The light theme, as the app's CSS variables have it (global.css). */
export const FIXTURE_THEME = {
  colors: {
    accent: "#007aff",
    background: "#ffffff",
    bubbleIncoming: "#e9e9eb",
    bubbleOutgoing: "#007aff",
    destructive: "#ff3b30",
    fill: "rgba(118, 118, 128, 0.12)",
    foreground: "#000000",
    highlight: "rgba(255, 204, 0, 0.18)",
    monogramBottom: "#858994",
    monogramTop: "#a6abb8",
    muted: "rgba(60, 60, 67, 0.6)",
    onAccent: "#ffffff",
    separator: "rgba(60, 60, 67, 0.29)",
    subtle: "rgba(60, 60, 67, 0.3)",
    textIncoming: "#000000",
    textOutgoing: "#ffffff",
  },
  metrics: {
    avatarSize: 36,
    bubbleMaxWidthFraction: 0.75,
    bubbleRadius: 20,
    horizontalPadding: 16,
    rowGap: 4,
    runGap: 14,
  },
  type: {
    body: { lineHeight: 22, size: 17 },
    caption: { lineHeight: 16, size: 12 },
    footnote: { lineHeight: 18, size: 13 },
    jumbo: { lineHeight: 44, size: 40 },
    name: { lineHeight: 16, size: 12 },
  },
} satisfies Theme;

export const FIXTURE_BEHAVIOR = {
  fadeMs: 400,
  firehoseFrom: 8,
  firehoseUntil: 3,
  firehoseWindowMs: 2000,
  loadAheadScreens: 10,
  moveMs: 420,
  nearLatestPoints: 80,
} satisfies Behavior;

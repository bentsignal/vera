import type { Block, MediaItem, Person, Reaction } from "./contract";

// The blocks of made-up messages for `/dev-native-list` (see
// dev-fixtures.ts): every block type, and a media-heavy mix for flinging.

export const ME = { avatarUrl: null, id: "me", initials: "ME", name: "Me" };

export const PEOPLE = [
  { avatarUrl: null, id: "maya", initials: "MC", name: "Maya Chen" },
  { avatarUrl: null, id: "jonah", initials: "JW", name: "Jonah Weiss" },
  {
    avatarUrl: "https://picsum.photos/id/64/200/200",
    id: "priya",
    initials: "PN",
    name: "Priya Natarajan",
  },
  ME,
] satisfies Person[];

export const LINES = [
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

/** `value` mod `by`, never negative (arrivals count down from -1). */
export function mod(value: number, by: number) {
  return ((value % by) + by) % by;
}

/** Someone from `PEOPLE`, by index. */
export function person(index: number) {
  return PEOPLE[mod(index, PEOPLE.length)] ?? ME;
}

export function line(index: number) {
  return LINES[mod(index, LINES.length)] ?? "";
}

export function thumbs(count: number, mine: boolean) {
  return {
    content: { emoji: "👍" },
    count,
    key: "👍",
    mine,
  } satisfies Reaction;
}

function photo(seed: number, index: number, width = 1200, height = 900) {
  const id = mod(seed * 7 + index, 80);
  return {
    height,
    id: `p${seed}-${index}`,
    kind: "image",
    part: `attachment:p${seed}-${index}`,
    reactions: index === 1 ? [thumbs(1, false)] : [],
    thumbnailUrl: `https://picsum.photos/id/${id}/${Math.round(width / 3)}/${Math.round(height / 3)}`,
    url: `https://picsum.photos/id/${id}/${width}/${height}`,
    width,
  } satisfies MediaItem;
}

function video(seed: number) {
  return {
    ...photo(seed, 0, 1280, 720),
    durationSeconds: 42 + mod(seed, 90),
    id: `v${seed}`,
    kind: "video",
    part: `attachment:v${seed}`,
    reactions: [],
  } satisfies MediaItem;
}

function text(value: string) {
  return {
    part: "message",
    spans: [{ text: value }],
    type: "text",
  } satisfies Block;
}

function media(items: MediaItem[]) {
  return { items, type: "media" } satisfies Block;
}

function linkCard(seed: number) {
  return {
    description: "A video everyone needs to see",
    imageHeight: 360,
    imageUrl: `https://picsum.photos/id/${mod(seed, 80)}/640/360`,
    imageWidth: 640,
    site: "youtube.com",
    title: "The best video",
    type: "linkCard",
    url: "https://youtube.com",
  } satisfies Block;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- on purpose: a block type no binary knows yet
const POLL = { type: "poll" } as unknown as Block;

/** Almost every message has photos or a video, for flinging. */
const HEAVY = [
  (index: number) => [
    media(
      [0, 1, 2, 3, 4].map((item) => photo(index, item, 900 + item * 150, 1200)),
    ),
  ],
  (index: number) => [media([video(index)])],
  (index: number) => [text(line(index)), media([photo(index, 0)])],
  (index: number) => [media([photo(index, 0, 900, 1200)]), linkCard(index)],
  (index: number) => [media([0, 1, 2].map((item) => photo(index, item)))],
] satisfies ((index: number) => Block[])[];

/** A varied mix like a real group chat: one of each block type and more. */
const MIXED = [
  (index: number) => [text(line(index))],
  (index: number) => [text(line(index))],
  (index: number) => [media([photo(index, 0)])],
  (index: number) => [text(line(index))],
  (index: number) => [
    text(line(index)),
    media(
      [0, 1, 2, 3].map((item) => photo(index, item, 900 + item * 100, 1200)),
    ),
  ],
  () => [
    {
      part: "message",
      spans: [
        { text: "Look at this " },
        {
          style: "link",
          text: "youtube.com/watch?v=x",
          url: "https://youtube.com",
        },
      ],
      type: "text",
    },
    linkCard(20),
  ],
  () => [
    { jumbo: true, part: "message", spans: [{ text: "😂😂" }], type: "text" },
  ],
  () => [
    {
      author: person(0),
      messageId: "quoted",
      text: "Is anyone around this weekend?",
      type: "quote",
    },
    {
      part: "message",
      spans: [
        { text: "Me! " },
        { accountId: "maya", style: "mention", text: "@Maya" },
      ],
      type: "text",
    },
  ],
  () => [
    {
      name: "plans.pdf",
      part: "attachment:f",
      sizeLabel: "2.4 MB",
      type: "file",
      url: "https://example.com",
    },
  ],
  (index: number) => [media([video(index)])],
  () => [
    {
      part: "message",
      spans: [
        { text: "Some " },
        { style: "bold", text: "bold" },
        { text: ", some " },
        { style: "italic", text: "italic" },
        { text: ", and " },
        { style: "code", text: "code()" },
        { text: ", all in one message that wraps onto a second line." },
      ],
      type: "text",
    },
  ],
  () => [{ label: "This message was deleted", type: "deleted" }],
  () => [
    {
      author: person(2),
      messageId: "quoted-photo",
      text: "Photo",
      thumbnailUrl: "https://picsum.photos/id/10/120/120",
      type: "quote",
    },
    text("Where was this taken?"),
  ],
  (index: number) => [media([{ ...photo(index, 0), uploading: true }])],
  // A block type this binary doesn't know: drawn as the row's
  // `fallbackText` (see UNKNOWN_BLOCK).
  () => [POLL],
  () => [
    text("The menu's up"),
    {
      site: "example.com",
      type: "linkCard",
      url: "https://example.com/menus/autumn-2026",
    },
  ],
  (index: number) => [text(line(index))],
] satisfies ((index: number) => Block[])[];

/** Which mixed message is the one with an unknown block. */
export const UNKNOWN_BLOCK = 14;

export function blocksFor(index: number, heavy: boolean) {
  const builders = heavy ? HEAVY : MIXED;
  const build = builders[mod(index, builders.length)];
  return build ? build(index) : [text(line(index))];
}

export const MIXED_LENGTH = MIXED.length;

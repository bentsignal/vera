// The mixed media dev seed's messages (`devMixed:seed`), apart from the
// Convex action so the app's tests can check that every reaction lands on
// the part it's meant for, as the app maps parts.

// MDN's CC0 sample clip (H.264 and AAC, 960 × 540, 5.055 s), with a
// poster made from its first frame. The earlier Google sample answered
// 403, and iOS showed it as unsupported.
const VIDEO = {
  durationMs: 5055,
  height: 540,
  kind: "video" as const,
  mimeType: "video/mp4",
  name: "flower.mp4",
  size: 1_128_375,
  thumbnailUrl:
    "https://vera-evidence.b-cdn.net/pr/t3-native-message-list-integration/20261024-123519-398fa974/r2-flower-poster.jpg",
  url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  width: 960,
};

const FILE = {
  kind: "file" as const,
  mimeType: "application/pdf",
  name: "itinerary.pdf",
  size: 13_264,
  url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
};

function photo(seed: string, width: number, height: number) {
  return {
    height,
    kind: "image" as const,
    mimeType: "image/jpeg",
    name: `IMG_${seed}.jpg`,
    size: 400_000,
    url: `https://picsum.photos/seed/vera-mixed-${seed}/${width}/${height}`,
    width,
  };
}

export type Attachment = ReturnType<typeof photo> | typeof VIDEO | typeof FILE;

/** One message: who sends it (0 is you, 1–4 the bots), what, and reactions. */
export interface Line {
  readonly from: number;
  readonly body: string;
  readonly attachments?: readonly Attachment[];
  /**
   * Reactions by bot (1–4): on its attachment `on`, or without it, on the
   * message itself (its text, or its first attachment when it has none).
   */
  readonly reactions?: readonly {
    readonly by: number;
    readonly emoji: string;
    readonly on?: number;
  }[];
}

export const LINES: readonly Line[] = [
  { body: "Okay, photos from the weekend coming in", from: 1 },
  {
    attachments: [
      photo("ridge", 1600, 1200),
      photo("lake", 1200, 1600),
      photo("camp", 1080, 1080),
    ],
    body: "",
    from: 1,
    reactions: [
      { by: 2, emoji: "❤️", on: 0 },
      { by: 3, emoji: "❤️", on: 0 },
      { by: 4, emoji: "😂", on: 2 },
      { by: 2, emoji: "👍" },
    ],
  },
  { body: "The lake one is unreal", from: 0 },
  {
    attachments: [VIDEO],
    body: "Flowers by the trail",
    from: 3,
    reactions: [{ by: 1, emoji: "🔥", on: 0 }],
  },
  {
    attachments: [photo("trail", 1170, 2532), VIDEO],
    body: "",
    from: 4,
    reactions: [
      { by: 1, emoji: "😮", on: 1 },
      { by: 3, emoji: "👍", on: 0 },
    ],
  },
  {
    attachments: [FILE],
    body: "Here's the plan for next time",
    from: 2,
    reactions: [{ by: 4, emoji: "👍", on: 0 }],
  },
  {
    body: "Have you seen this? https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    from: 1,
  },
  {
    attachments: [
      photo("peak", 2400, 900),
      photo("tent", 1600, 1200),
      photo("fire", 1200, 1600),
      photo("map", 1080, 1080),
    ],
    body: "Panorama from the top, and the rest of the trip",
    from: 3,
    reactions: [
      { by: 1, emoji: "🎉", on: 1 },
      { by: 2, emoji: "❤️", on: 3 },
      { by: 4, emoji: "❤️", on: 3 },
    ],
  },
  {
    attachments: [photo("solo", 1200, 1600)],
    body: "",
    from: 0,
    reactions: [{ by: 2, emoji: "😂", on: 0 }],
  },
  {
    body: "Okay so for next time: we meet at the trailhead at 8, do the loop counterclockwise so the steep part is in the shade, and stop at the lake for lunch. Bring layers, it gets cold up top even in summer.",
    from: 2,
    reactions: [
      { by: 1, emoji: "👍" },
      { by: 3, emoji: "👍" },
      { by: 4, emoji: "🙌" },
    ],
  },
  { body: "🔥🔥", from: 4 },
  { body: "count me in", from: 0 },
];

/**
 * The protocol's `attachment` for a reaction on attachment `on` of a
 * message with `body`, as the app sends one (`attachmentPart` and
 * `partArgs` in apps/mobile/src/features/messaging): the first attachment
 * of a message without text is the message itself, which has no
 * `attachment`. Sending `attachment: 0` there stores a part no row draws.
 */
export function reactionAttachment(body: string, on: number | undefined) {
  if (on === undefined || (on === 0 && body === "")) return undefined;
  return on;
}

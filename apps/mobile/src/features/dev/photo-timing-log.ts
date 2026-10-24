// Timings for opening a photo from the list (round 2, item 7), kept for
// `veraDev.photoTiming` (photo-timing.ts). Plain data and math, so the
// spans are tested on their own.

/** Where along opening a photo a mark was taken. */
export type PhotoStep =
  /** JavaScript got the list's `media` press. */
  | "press"
  /** The viewer's screen laid out. */
  | "viewerLayout"
  /** A page's photo frame laid out (its `url`). */
  | "pageLayout"
  /** expo-image started loading a page's photo. */
  | "loadStart"
  /** expo-image loaded it (`onLoad`). */
  | "load"
  /** expo-image put it on screen (`onDisplay`). */
  | "display";

export interface PhotoMark {
  readonly step: PhotoStep;
  /** Milliseconds, monotonic (`performance.now()`). */
  readonly at: number;
  /** Milliseconds since the epoch, to line up with videos and logs. */
  readonly wall: number;
  readonly url?: string;
  /** The item pressed, in its message's photos and videos. */
  readonly index?: number;
}

/** The most marks kept: older ones fall off. */
export const MAX_MARKS = 200;

/** A bounded list of marks, oldest first. */
export function createTimingLog(limit = MAX_MARKS) {
  let marks = new Array<PhotoMark>();
  return {
    mark(mark: PhotoMark) {
      marks.push(mark);
      if (marks.length > limit) marks = marks.slice(marks.length - limit);
    },
    marks: () => [...marks],
    reset() {
      marks = new Array<PhotoMark>();
    },
  };
}

/** Milliseconds from a press to each step for the photo it opened. */
export interface PhotoOpen {
  readonly url: string | undefined;
  readonly index: number | undefined;
  /** When it was pressed, since the epoch. */
  readonly pressedAt: number;
  readonly viewerLayout?: number;
  readonly pageLayout?: number;
  readonly loadStart?: number;
  readonly load?: number;
  readonly display?: number;
}

/**
 * Each press, and how long until the viewer laid out, and until the
 * pressed photo's page laid out, started loading, loaded and showed. Only
 * marks for the pressed `url` count, so a neighbor page loading isn't
 * taken for it. A step that never came is missing, not zero.
 */
export function photoOpens(marks: readonly PhotoMark[]) {
  const opens = new Array<PhotoOpen>();
  marks.forEach((press, index) => {
    if (press.step !== "press") return;
    const next = marks.findIndex(
      (mark, later) => later > index && mark.step === "press",
    );
    const after = marks.slice(index + 1, next === -1 ? undefined : next);
    function first(step: PhotoStep, url?: string) {
      const found = after.find(
        (mark) => mark.step === step && (url === undefined || mark.url === url),
      );
      return found === undefined ? undefined : found.at - press.at;
    }
    opens.push({
      display: first("display", press.url),
      index: press.index,
      load: first("load", press.url),
      loadStart: first("loadStart", press.url),
      pageLayout: first("pageLayout", press.url),
      pressedAt: press.wall,
      url: press.url,
      viewerLayout: first("viewerLayout"),
    });
  });
  return opens;
}

// The frame report's numbers, apart from the recording (frames.ts) so
// they're tested on their own.

/**
 * The fixed thresholds the report also counts frames over, in ms, as the
 * chip material comparison asks: over 16.7 ms and over 33 ms.
 */
export const FIXED_THRESHOLDS_MS = { over16ms: 16.7, over33ms: 33 } as const;

/**
 * How smoothly the UI thread drew while recording: every frame it drew, and
 * the ones that took noticeably longer than the screen's refresh. Animations
 * run on the UI thread, so a slow frame there is a visible hitch, whatever
 * JavaScript was doing.
 */
export interface FrameReport {
  /** Frames drawn while recording. */
  readonly frames: number;
  readonly seconds: number;
  /** The screen's refresh rate, from the typical frame. */
  readonly hz: number;
  /** Frames that took over 1.5 refreshes: each is a visible hitch. */
  readonly slow: number;
  /** Refreshes missed in all (a 3-refresh frame misses 2). */
  readonly dropped: number;
  /**
   * Frames longer than exactly 16.7 ms and 33 ms (`FIXED_THRESHOLDS_MS`),
   * whatever the refresh rate, for comparisons that ask for those
   * thresholds. A 60 Hz frame of one refresh (16.67 ms) isn't over 16.7;
   * one of two refreshes (33.3 ms) is over 33. On a 120 Hz screen, 16.7 ms
   * is two refreshes. `slow` stays the hitch count.
   */
  readonly over16ms: number;
  readonly over33ms: number;
  /** The thresholds `over16ms` and `over33ms` count over, in ms. */
  readonly thresholdsMs: typeof FIXED_THRESHOLDS_MS;
  /** The longest frame, in milliseconds, slow or not. */
  readonly worstMs: number;
  /** The longest slow frames, in milliseconds, longest first (ten at most). */
  readonly worst: readonly number[];
  /**
   * Each slow frame in order, as "<when>+<how long>" in milliseconds from
   * the start, to line them up with what was happening.
   */
  readonly timeline: readonly string[];
}

export function summarize(intervals: readonly number[]) {
  "worklet";
  const sorted = [...intervals].sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length / 2)] ?? 1000 / 60;
  const slow = intervals.filter((interval) => interval > typical * 1.5);
  return {
    dropped: intervals.reduce(
      (missed, interval) =>
        missed + Math.max(0, Math.round(interval / typical) - 1),
      0,
    ),
    frames: intervals.length,
    hz: Math.round(1000 / typical),
    over16ms: intervals.filter(
      (interval) => interval > FIXED_THRESHOLDS_MS.over16ms,
    ).length,
    over33ms: intervals.filter(
      (interval) => interval > FIXED_THRESHOLDS_MS.over33ms,
    ).length,
    seconds:
      Math.round(intervals.reduce((total, interval) => total + interval, 0)) /
      1000,
    slow: slow.length,
    thresholdsMs: FIXED_THRESHOLDS_MS,
    timeline: intervals.flatMap((interval, index) => {
      if (interval <= typical * 1.5) return [];
      const at = intervals
        .slice(0, index)
        .reduce((total, earlier) => total + earlier, 0);
      return [`${Math.round(at)}+${Math.round(interval)}`];
    }),
    worstMs: Math.round(Math.max(0, ...intervals) * 10) / 10,
    worst: [...slow]
      .sort((a, b) => b - a)
      .slice(0, 10)
      .map((interval) => Math.round(interval * 10) / 10),
  } satisfies FrameReport;
}

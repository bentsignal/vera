// The open conversation's list, for benchmarks that run outside React
// (`globalThis.veraDev.list`), whichever list it is: the native one or the
// React Native one. Both scroll the same way here, at a constant speed on
// the UI thread, so the two can be measured head to head without a test
// driver's injected touches (.plans/native-message-list.md).

export interface FlingResult {
  /** Points actually scrolled. */
  readonly travelled: number;
  /** Time spent stuck at the oldest row while older rows loaded. */
  readonly edgeMs: number;
}

export interface DevList {
  readonly kind: "native" | "rn";
  /**
   * Scrolls toward older messages at `speed` points a second for `ms`;
   * null if this list can't (a native binary without `benchFling`).
   */
  readonly fling: (speed: number, ms: number) => Promise<FlingResult | null>;
}

let current: DevList | undefined;

/** Hands the open list to scripts; returns what takes it back. */
export function registerDevList(list: DevList) {
  current = list;
  return () => {
    if (current === list) current = undefined;
  };
}

/** The open list, for `globalThis.veraDev.list()`. */
export function devList() {
  return current;
}

let stalls: { worst: number; count: number; total: number } | undefined;
let stallTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Starts counting the JavaScript thread's stalls: a 16 ms timer firing
 * over 50 ms late.
 */
export function startStalls() {
  if (stallTimer !== undefined) clearInterval(stallTimer);
  const recording = { count: 0, total: 0, worst: 0 };
  stalls = recording;
  let last = performance.now();
  stallTimer = setInterval(() => {
    const now = performance.now();
    const gap = now - last;
    if (gap > 50) {
      recording.count += 1;
      recording.total += gap;
      recording.worst = Math.max(recording.worst, gap);
    }
    last = now;
  }, 16);
}

/** Stops counting, and reports the stalls: how many, the worst, in all. */
export function stopStalls() {
  if (stallTimer !== undefined) clearInterval(stallTimer);
  stallTimer = undefined;
  const recording = stalls ?? { count: 0, total: 0, worst: 0 };
  return {
    count: recording.count,
    totalMs: Math.round(recording.total),
    worstMs: Math.round(recording.worst),
  };
}

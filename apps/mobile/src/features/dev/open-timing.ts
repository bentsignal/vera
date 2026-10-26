import { env } from "~/env";

// Development and profile bundles on a dev PDS only: how long each screen
// takes to show its content, for measuring first opens
// (`scripts/sim.sh eval "globalThis.veraDev.timings()"`, .plans/data-pass.md).
// From the JavaScript bundle starting for the first screen, and from
// `veraDev.open` for each one after.

const measuring = (__DEV__ || env.profileBundle) && env.devTools;
let openedAt = performance.now();
const shown = new Map<string, number>();

/** A screen is about to open (`veraDev.open`): time it from now. */
export function timeOpening() {
  openedAt = performance.now();
  shown.clear();
}

/**
 * The screen shows its content now (once every condition holds), if it
 * hasn't since it opened.
 */
export function markShown(screen: string, ...showing: boolean[]) {
  if (!measuring || shown.has(screen) || !showing.every(Boolean)) return;
  shown.set(screen, Math.round(performance.now() - openedAt));
}

/** Milliseconds from opening to showing, by screen. */
export function openTimings() {
  return Object.fromEntries(shown);
}

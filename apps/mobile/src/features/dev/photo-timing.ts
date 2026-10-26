import type { PhotoMark, PhotoStep } from "./photo-timing-log";
import { env } from "~/env";
import { createTimingLog, photoOpens } from "./photo-timing-log";

// Development and profile bundles on a dev PDS only (as `veraDev`, see
// automation.ts): store builds mark nothing and send nothing anywhere.
// Marks go in a bounded list in memory, with no React state, so taking
// them doesn't change when anything renders. Read and clear it with
// `veraDev.photoTiming.report()` and `.reset()`.

const enabled = (__DEV__ || env.profileBundle) && env.devTools;
const log = createTimingLog();

/** Marks a step of opening a photo, if timing is on in this build. */
export function markPhoto(
  step: PhotoStep,
  detail: Pick<PhotoMark, "index" | "url"> = {},
) {
  if (!enabled) return;
  log.mark({ ...detail, at: performance.now(), step, wall: Date.now() });
}

export const photoTiming = {
  /** Each press with its timings, and the raw marks behind them. */
  report: () => ({ marks: log.marks(), opens: photoOpens(log.marks()) }),
  reset: () => log.reset(),
};

/**
 * How long a launch may stay on the blank splash while it checks for and
 * downloads an update. Most finish sooner and never show anything else.
 */
export const BLANK_FOR_MS = 1_500;
/** Once "Updating Vera…" shows, it stays at least this long, so it never flashes. */
export const COVER_AT_LEAST_MS = 1_000;
/** When "Continue Without Updating" appears under "Updating Vera…". */
export const CONTINUE_AFTER_MS = 15_000;
/** A check or download with no news for this long has stalled: open the app. */
export const STALL_MS = 10_000;
/** However the update is doing, the app opens by this long after launch. */
export const GIVE_UP_MS = 60_000;

export interface LaunchGateState {
  readonly now: number;
  /** When the app launched. */
  readonly startedAt: number;
  /** When expo-updates last reported anything: a check result or progress. */
  readonly heardAt: number;
  /** When "Updating Vera…" appeared, if it has. */
  readonly coverShownAt: number | undefined;
  /** Whether the launch's own check and download are still going. */
  readonly running: boolean;
  /** Whether a newer update is downloaded and ready to restart into. */
  readonly updateReady: boolean;
}

/**
 * What a launch shows while it brings in an update: "blank" (the splash),
 * "cover" ("Updating Vera…"), then "restart" into the update or "open" the
 * app as it is.
 */
export type LaunchStep = "blank" | "cover" | "open" | "restart";

/** The step a launch is on. Every path ends in "open" or "restart". */
export function launchStep(state: LaunchGateState): LaunchStep {
  const elapsed = state.now - state.startedAt;
  // Nothing holds the app past this, whatever expo-updates says or doesn't.
  if (elapsed >= GIVE_UP_MS) return "open";
  const coverDone =
    state.coverShownAt === undefined ||
    state.now - state.coverShownAt >= COVER_AT_LEAST_MS;
  if (state.updateReady) return coverDone ? "restart" : "cover";
  const over = !state.running || state.now - state.heardAt >= STALL_MS;
  if (over) return coverDone ? "open" : "cover";
  return elapsed >= BLANK_FOR_MS ? "cover" : "blank";
}

/** Whether "Updating Vera…" offers to continue without the update. */
export function canContinue(state: Pick<LaunchGateState, "now" | "startedAt">) {
  return state.now - state.startedAt >= CONTINUE_AFTER_MS;
}

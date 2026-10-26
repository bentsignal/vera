/**
 * How long after the app opens a downloaded update may restart it at once.
 * Opening already shows a brief splash, so a restart this soon reads as part
 * of opening.
 */
export const OPEN_WINDOW_MS = 3_000;
/**
 * After that, an update waits for a pause this long with no touches and the
 * keyboard down, so it never restarts the app under someone typing or
 * scrolling. The app reopens on the same screen, so a reader sees a blink.
 */
export const QUIET_MS = 10_000;

export interface RestartState {
  /**
   * Whether the app is running the bundle built into its binary, which may
   * be far behind: a new install from the store or TestFlight.
   */
  readonly embeddedLaunch: boolean;
  /** When the app last launched or came back from the background. */
  readonly openedAt: number;
  /** When the screen was last touched. */
  readonly touchedAt: number;
  readonly now: number;
  /** Whether the app is in the foreground. */
  readonly active: boolean;
  readonly keyboardVisible: boolean;
  /** Whether the photo and video viewer is open: watching a video is use. */
  readonly viewingMedia: boolean;
  /** Messages that would be lost: still sending, or failed and kept to retry. */
  readonly unsentMessages: boolean;
  /** Changes still on their way to a server. */
  readonly pendingMutations: number;
}

/** Whether restarting into a downloaded update now interrupts nothing. */
export function canRestartForUpdate(state: RestartState) {
  if (!state.active || state.unsentMessages || state.pendingMutations > 0) {
    return false;
  }
  if (state.now - state.openedAt <= OPEN_WINDOW_MS) return true;
  if (state.keyboardVisible || state.viewingMedia) return false;
  // The built-in bundle can be dozens of updates behind, so it doesn't wait
  // for a pause: someone just setting up the app shouldn't keep using it.
  return state.embeddedLaunch || state.now - state.touchedAt >= QUIET_MS;
}

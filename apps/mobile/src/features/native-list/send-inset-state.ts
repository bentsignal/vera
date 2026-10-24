// The composer inset's state after a send (see `useComposerInset`), as
// plain steps, so the order of renders, arrivals and timers is tested on
// its own.

/** A send's shorter composer, waiting for the message sent. */
export interface Held {
  /** The composer's height before the send. */
  readonly height: number;
  /** The newest row when it was sent, which the message sent replaces. */
  readonly newest: string | undefined;
}

export interface InsetState {
  /** The composer's height now. */
  readonly height: number;
  readonly held: Held | undefined;
}

/**
 * A send made the composer shorter, to `now`: `hold` keeps the old height
 * until the newest row changes from the one it was sent under.
 */
export function sentShorter(state: InsetState, now: number, hold: Held) {
  return { height: now, held: hold } satisfies InsetState;
}

/** Any other change to the composer's height: taken at once. */
export function changed(state: InsetState, now: number) {
  return { ...state, height: now } satisfies InsetState;
}

/**
 * `hold` ran out of time (the message sent went in off screen, or nothing
 * arrived): let it go, unless a later send's hold has taken its place.
 */
export function expired(state: InsetState, hold: Held) {
  if (state.held !== hold) return state;
  return { ...state, held: undefined } satisfies InsetState;
}

/**
 * The height for `insets.bottom` in a render whose newest row is
 * `newest`: the old one while the hold waits, the new one from the render
 * the newest row changes in, so native gets it with those rows.
 */
export function insetOf(state: InsetState, newest: string | undefined) {
  const { held, height } = state;
  return held !== undefined && held.newest === newest ? held.height : height;
}

// The composer inset, and which messages the native list gets, around a
// send (see `useComposerInset`), as plain steps, so the order of renders,
// height reports and timers is tested on its own.

/** A send whose message waits for the composer's new height. */
export interface Pending {
  /** Which send (`ComposerHeight.sends`). */
  readonly sends: number;
  /**
   * The newest message native had when it was sent: newer ones wait,
   * undefined when it had none.
   */
  readonly after: string | undefined;
  /**
   * Whether a height came while attachments still close a step at a time:
   * the messages then go once they're done.
   */
  readonly known: boolean;
}

export interface InsetState {
  /** The composer's height as native has it. */
  readonly height: number;
  /** The newest message native has, while nothing waits. */
  readonly newest: string | undefined;
  /** The latest send seen. */
  readonly sends: number;
  readonly pending: Pending | undefined;
}

/**
 * Whether a send waits for the composer to get shorter: only when its
 * field (text, reply, attachments) is taller than its least, since sending
 * empties all of them. A one-line send has nothing to wait for, and an edit
 * adds no message.
 */
export function holdsForSend({
  editing,
  field,
  least,
}: {
  editing: boolean;
  field: number;
  least: number;
}) {
  return !editing && field > least + 0.5;
}

/**
 * A render: a new send starts waiting under the newest message native has;
 * otherwise that's the newest message there is. The same state when
 * nothing changed, so setting it in render settles.
 */
export function rendered(
  state: InsetState,
  { sends, newest }: { sends: number; newest: string | undefined },
) {
  if (sends !== state.sends) {
    return {
      ...state,
      sends,
      pending: { after: state.newest, known: false, sends },
    } satisfies InsetState;
  }
  if (state.pending === undefined && newest !== state.newest) {
    return { ...state, newest } satisfies InsetState;
  }
  return state;
}

/**
 * The composer reported its height (`onSentShorter` or `onHeight`): taken
 * at once, letting a waiting send's messages go with it, unless
 * attachments are still closing (`stepping`), whose last height they wait
 * for. A height native already has changes nothing.
 */
export function withHeight(state: InsetState, now: number, stepping: boolean) {
  const { pending } = state;
  if (pending === undefined) {
    if (Math.abs(now - state.height) < 0.5) return state;
    return { ...state, height: now } satisfies InsetState;
  }
  if (stepping) {
    return {
      ...state,
      pending: { ...pending, known: true },
    } satisfies InsetState;
  }
  return { ...state, height: now, pending: undefined } satisfies InsetState;
}

/**
 * `sends`' wait is over (attachments done closing, or the guard): its
 * messages go with `measured`, the composer's height on the UI thread now,
 * which has the shrink as soon as it happens, even while its report to
 * JavaScript is still queued (that report then changes nothing). A later
 * send's wait isn't this one's to end.
 */
export function waited(state: InsetState, sends: number, measured: number) {
  if (state.pending?.sends !== sends) return state;
  return {
    ...state,
    height: measured,
    pending: undefined,
  } satisfies InsetState;
}

/**
 * The messages for native: while a send waits, none newer than the one it
 * waits under. If that one is gone (the list reloaded), all of them.
 */
export function heldMessages<T extends { readonly id: string }>(
  state: InsetState,
  messages: readonly T[],
) {
  const { pending } = state;
  if (pending === undefined) return messages;
  if (pending.after === undefined) return [];
  const at = messages.findIndex((message) => message.id === pending.after);
  return at === -1 ? messages : messages.slice(0, at + 1);
}

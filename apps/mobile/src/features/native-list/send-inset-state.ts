import type { SendCommit } from "../conversation/send-commit.ts";

/** Rows native already has, until one specific send's clear is acknowledged. */
export interface Pending {
  readonly sends: number;
  readonly before: readonly string[];
}

export interface InsetState {
  readonly height: number;
  readonly visible: readonly string[];
  readonly sends: number;
  readonly pending: Pending | undefined;
}

function sameIds(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length && left.every((id, at) => id === right[at])
  );
}

/** All sends hold, including one-line fields with no subsequent onLayout. */
export function rendered(
  state: InsetState,
  { sends, ids }: { sends: number; ids: readonly string[] },
) {
  if (sends > state.sends) {
    return {
      ...state,
      sends,
      pending: { sends, before: state.pending?.before ?? state.visible },
    } satisfies InsetState;
  }
  if (state.pending === undefined && !sameIds(state.visible, ids)) {
    return { ...state, visible: ids } satisfies InsetState;
  }
  return state;
}

/** Generic or late height observations cannot release a pending submission. */
export function withHeight(state: InsetState, height: number) {
  if (state.pending !== undefined || Math.abs(state.height - height) < 0.5) {
    return state;
  }
  return { ...state, height } satisfies InsetState;
}

/** A known local row, never another person's concurrent arrival. */
export function sendReady(send: SendCommit, ids: readonly string[]) {
  return (
    send.height !== undefined &&
    (send.cancelled || ids.includes(send.messageId ?? ""))
  );
}

function navigationReady(send: SendCommit) {
  return send.cancelled || !send.latestRequested || send.latestArmed === true;
}

/** Only a matching clear ACK and the specific optimistic row release a pair. */
export function acknowledged(
  state: InsetState,
  {
    send,
    height,
    ids,
    frozen,
  }: {
    send: SendCommit;
    height: number;
    ids: readonly string[];
    frozen: boolean;
  },
) {
  if (
    frozen ||
    state.pending?.sends !== send.sequence ||
    !sendReady(send, ids) ||
    !navigationReady(send)
  )
    return state;
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error(
      "Cannot release a send without committed composer geometry",
    );
  }
  return {
    height,
    visible: ids,
    sends: state.sends,
    pending: undefined,
  } satisfies InsetState;
}

/** Render-derived pair state; measurement and freeze observations arrive separately. */
export function insetFor(
  state: InsetState,
  send: SendCommit,
  ids: readonly string[],
  frozen: boolean,
) {
  const next = rendered(state, { sends: send.sequence, ids });
  const layout = send.layout;
  if (layout === undefined || frozen || layout.frozen) return next;
  return next.pending === undefined
    ? withHeight(next, layout.height)
    : acknowledged(next, { send, height: layout.height, ids, frozen });
}

export function initialInset(
  send: SendCommit,
  ids: readonly string[],
  height: number,
) {
  const waiting = send.sequence > 0 && send.height === undefined;
  return {
    height,
    visible: waiting ? [] : ids,
    pending: waiting ? { sends: send.sequence, before: [] } : undefined,
    sends: send.sequence,
  } satisfies InsetState;
}

/** Keep current versions of old rows, even if the old newest was deleted. */
export function heldMessages<T extends { readonly id: string }>(
  state: InsetState,
  messages: readonly T[],
) {
  if (state.pending === undefined) return messages;
  const before = new Set(state.pending.before);
  return messages.filter((message) => before.has(message.id));
}

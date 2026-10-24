import { observedLayout, sendNavigation } from "./send-navigation.ts";

/** One local submission; no server acknowledgement participates. */
export interface SendCommit {
  readonly sequence: number;
  readonly clear: number;
  readonly files: readonly string[];
  readonly messageId: string | undefined;
  readonly height: number | undefined;
  readonly cancelled: boolean;
  readonly layout?: { readonly height: number; readonly frozen: boolean };
  readonly latestRequested?: boolean;
  readonly latestArmed?: boolean;
  readonly published?: boolean;
}

/** Local send identity and clear-layout acknowledgement, scoped to a composer. */
export function createSendCommit(
  owner = "",
  observe?: (step: string, value: SendCommit) => void,
) {
  return sendCommitStore(
    {
      sequence: 0,
      clear: 0,
      files: [],
      messageId: undefined,
      height: undefined,
      cancelled: false,
    },
    owner,
    observe,
  );
}

function sendCommitStore(
  initial: SendCommit,
  owner: string,
  observe: ((step: string, value: SendCommit) => void) | undefined,
) {
  let current = initial;
  const listeners = new Set<() => void>();
  function publish(step: string, next: SendCommit) {
    current = next;
    observe?.(step, next);
    for (const listener of listeners) listener();
  }
  return {
    ...sendNavigation(() => current, publish),
    owner,
    read: () => current,
    sequence: () => current.sequence,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    begin: (clear: number, files: readonly string[]) => {
      publish("begin", {
        sequence: current.sequence + 1,
        clear,
        files,
        messageId: undefined,
        height: undefined,
        cancelled: false,
      });
      return current.sequence;
    },
    expect: (sequence: number, messageId: string) => {
      if (sequence !== current.sequence || current.cancelled) return;
      publish("expected row", { ...current, messageId });
    },
    acknowledge: (sequence: number, height: number) => {
      if (sequence !== current.sequence || current.height !== undefined) return;
      if (!Number.isFinite(height) || height <= 0) {
        throw new Error("Composer clear committed without a valid bar height");
      }
      publish("clear ACK", {
        ...current,
        height,
        layout: { height, frozen: current.layout?.frozen ?? false },
      });
    },
    observeLayout: (
      height: number,
      frozen = current.layout?.frozen ?? false,
    ) => {
      const next = observedLayout(current, height, frozen);
      if (next !== current) publish("committed layout", next);
    },
    cancel: (sequence: number) => {
      if (sequence !== current.sequence) return;
      publish("cancel", { ...current, cancelled: true });
    },
  };
}

export type SendCommitStore = ReturnType<typeof createSendCommit>;

/** The render has actually cleared this submission's draft and old files. */
export function clearIsCommitted(
  send: SendCommit,
  clear: number,
  files: readonly string[],
) {
  if (send.sequence === 0 || send.height !== undefined) return false;
  if (send.cancelled) return true;
  const removedFiles = new Set(send.files);
  return (
    send.messageId !== undefined &&
    clear >= send.clear &&
    !files.some((id) => removedFiles.has(id))
  );
}

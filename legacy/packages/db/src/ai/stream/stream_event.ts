import type { StreamResponseArgs } from "./program";

export type TimingField =
  | "initDurationMs"
  | "consumeDurationMs"
  | "followUpsDurationMs";

export interface EventDraft {
  threadId: string;
  generationId: string;
  userId: string;
  userPlan: string | null;
  model: string;
  startedAt: number;
  initDurationMs: number | null;
  consumeDurationMs: number | null;
  followUpsDurationMs: number | null;
  outcome: "success" | "error" | "user_aborted" | "early_aborted";
  errorCode: string | null;
  errorTag: string | null;
  errorMessage: string | null;
  errorOp: string | null;
  followUpsAttempted: boolean;
  followUpsSucceeded: boolean;
  followUpsErrorMessage: string | null;
}

export function causeMessage(cause: unknown) {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  return String(cause);
}

export function makeEventDraft(
  args: StreamResponseArgs & { resolvedModel: string },
) {
  return {
    threadId: args.threadId,
    generationId: args.generationId,
    userId: args.userId,
    userPlan: args.userPlan ?? null,
    model: args.resolvedModel,
    startedAt: Date.now(),
    initDurationMs: null,
    consumeDurationMs: null,
    followUpsDurationMs: null,
    outcome: "success",
    errorCode: null,
    errorTag: null,
    errorMessage: null,
    errorOp: null,
    followUpsAttempted: false,
    followUpsSucceeded: false,
    followUpsErrorMessage: null,
  } satisfies EventDraft;
}

export function updateEvent(draft: EventDraft, updates: Partial<EventDraft>) {
  Object.assign(draft, updates);
}

export async function timed<T>(
  draft: EventDraft,
  key: TimingField,
  work: () => Promise<T>,
) {
  const start = Date.now();
  try {
    return await work();
  } finally {
    updateEvent(draft, { [key]: Date.now() - start });
  }
}

export function emitStreamEvent(draft: EventDraft) {
  const totalDurationMs = Date.now() - draft.startedAt;
  const log = draft.outcome === "success" ? console.info : console.error;
  log("stream.generation", { ...draft, totalDurationMs });
}

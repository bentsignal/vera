import { PdsInitialResponseTimeoutError } from "./errors.ts";

export const DEFAULT_REVEAL_PARTIAL_RESULTS_AFTER = 500;
export const DEFAULT_INITIAL_RESPONSE_TIMEOUT = 2_000;

export interface PdsQueryExecutionOptions {
  readonly initialResponseTimeout?: number;
  readonly requireCompleteResults?: boolean;
  readonly revealPartialResultsAfter?: number;
}

export function partialResultsDelay(options: PdsQueryExecutionOptions) {
  const delay =
    options.revealPartialResultsAfter ?? DEFAULT_REVEAL_PARTIAL_RESULTS_AFTER;
  if (!Number.isFinite(delay) || delay < 0) {
    throw new RangeError(
      "revealPartialResultsAfter must be a finite, non-negative number",
    );
  }
  return delay;
}

export function initialResponseTimeout(options: PdsQueryExecutionOptions) {
  const timeout =
    options.initialResponseTimeout ?? DEFAULT_INITIAL_RESPONSE_TIMEOUT;
  if (!Number.isFinite(timeout) || timeout < 0) {
    throw new RangeError(
      "initialResponseTimeout must be a finite, non-negative number",
    );
  }
  return timeout;
}

export function withInitialResponseTimeout<Result>(
  promise: Promise<Result>,
  timeout: number,
  targetUrl: string,
) {
  return new Promise<Result>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new PdsInitialResponseTimeoutError(targetUrl)),
      timeout,
    );
    void promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

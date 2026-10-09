/**
 * How long typing must pause before a search runs. Long enough to skip the
 * letters in between, short enough to feel live.
 */
export const SEARCH_DELAY_MS = 250;

/** Search text as matched: trimmed and lowercased. */
export function normalizeSearch(text: string) {
  return text.trim().toLowerCase();
}

/**
 * Calls `settle` with the last value once `delayMs` passes without another.
 * Empty text settles right away, so clearing a search shows everything
 * again without a wait.
 */
export function createDebouncer({
  delayMs = SEARCH_DELAY_MS,
  settle,
}: {
  delayMs?: number;
  settle: (value: string) => void;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  function cancel() {
    clearTimeout(timer);
    timer = undefined;
  }
  function push(value: string) {
    cancel();
    if (normalizeSearch(value) === "") {
      settle("");
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      settle(value);
    }, delayMs);
  }
  return { cancel, push };
}

/**
 * Which query's results to show. A query whose results are still loading
 * keeps the last settled query on screen, so results never blank out or
 * flash "no results" in between.
 */
export function shownQuery({
  query,
  settled,
  isLoading,
}: {
  query: string;
  settled: string;
  isLoading: boolean;
}) {
  return isLoading ? settled : query;
}

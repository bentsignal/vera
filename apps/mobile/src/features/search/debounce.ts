/**
 * How long typing must pause before a search runs. Long enough that a
 * steady typist's letters in between never show results of their own (at
 * 250 ms, typing a little slowly settled on nearly every letter, so rows
 * came and went as each partial query matched), short enough to feel live.
 */
export const SEARCH_DELAY_MS = 400;

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

/** A search's results, with the query they answer. */
export interface SearchAnswer<Data> {
  readonly data: Data | undefined;
  readonly query: string;
}

/**
 * Which answer a search shows. While the newest query's results load, the
 * last settled answer stays up whole, its query with its own data, so
 * results never blank out, flash "no results", or pair one query's matches
 * with another's lookup. The shown answer then changes once, when the new
 * one has arrived.
 */
export function shownAnswer<Data>({
  current,
  settled,
  isLoading,
}: {
  current: SearchAnswer<Data>;
  settled: SearchAnswer<Data>;
  isLoading: boolean;
}) {
  return isLoading ? settled : current;
}

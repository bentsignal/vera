import type {
  DefaultError,
  QueryKey,
  UseQueryOptions,
} from "@tanstack/react-query";
import { useState } from "react";
// eslint-disable-next-line no-restricted-imports -- Searches follow typing, so there is no route loader to preload them from.
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { createDebouncer, shownAnswer } from "./debounce";

/**
 * A search field's query, updated once typing pauses (see
 * `SEARCH_DELAY_MS`). Keystrokes alone don't re-render the screen. Every
 * search in the app goes through this hook, and server lookups through
 * `useSearchQuery`; lint flags PDS searches anywhere else.
 */
export function useSearchText() {
  const [query, setQuery] = useState("");
  const [{ cancel, push }] = useState(() =>
    createDebouncer({ settle: setQuery }),
  );
  return {
    /** Empties the query now, for a field that was cleared. */
    clear: () => {
      cancel();
      setQuery("");
    },
    /** The text as typed; pass it to the field's `onChangeText`. */
    onChangeText: push,
    /** The text once typing paused. */
    query,
  };
}

/**
 * A PDS query that follows a debounced search `query`. While the next
 * query's results load, the previous answer stays up: `data` and `query`
 * are still the previous query's, together, so screens never blank out,
 * flash "no results", or mix one query with another's results in between.
 * A disabled lookup has nothing to wait for, so its query shows at once;
 * a failed one shows its query with no data rather than waiting forever.
 */
export function useSearchQuery<
  QueryFnData,
  Data = QueryFnData,
  Key extends QueryKey = QueryKey,
>({
  query,
  options,
}: {
  query: string;
  options: UseQueryOptions<QueryFnData, DefaultError, Data, Key>;
}) {
  const result = useQuery({
    ...options,
    placeholderData: keepPreviousData,
    select: options.select,
  });
  const enabled = options.enabled !== false;
  const isLoading =
    enabled &&
    !result.isError &&
    (result.isPlaceholderData || result.data === undefined);
  const current = { data: enabled ? result.data : undefined, query };
  const [settled, setSettled] = useState(current);
  // Remembers the last answer that arrived, query and data together
  // (React's pattern for keeping a value from earlier renders). TanStack
  // keeps equal results the same object, so this settles.
  if (
    !isLoading &&
    (settled.query !== current.query || settled.data !== current.data)
  ) {
    setSettled(current);
  }
  return shownAnswer({ current, isLoading, settled });
}

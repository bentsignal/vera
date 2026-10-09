import type {
  DefaultError,
  QueryKey,
  UseQueryOptions,
} from "@tanstack/react-query";
import { useState } from "react";
// eslint-disable-next-line no-restricted-imports -- Searches follow typing, so there is no route loader to preload them from.
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { createDebouncer, shownQuery } from "./debounce";

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
 * query's results load, the previous results stay up: `data` is still the
 * previous query's, and `query` says which query `data` answers, so screens
 * never blank out or flash "no results" in between. A disabled lookup has
 * nothing to wait for, so its query shows at once.
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
    enabled && (result.isPlaceholderData || result.data === undefined);
  const [settled, setSettled] = useState(query);
  // Remembers the last query whose results arrived (React's pattern for
  // keeping a value from earlier renders).
  if (!isLoading && settled !== query) setSettled(query);
  return {
    data: enabled ? result.data : undefined,
    query: shownQuery({ isLoading, query, settled }),
  };
}

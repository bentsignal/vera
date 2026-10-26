/** A query in the cache: its key and what it holds, as `getQueriesData` lists them. */
type CachedQuery = readonly [queryKey: readonly unknown[], data: unknown];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/** The message IDs a batch query asks about: its request's `messageIds`. */
function messageIdsOf(queryKey: readonly unknown[]) {
  const request = queryKey.at(-1);
  if (!isRecord(request) || !isRecord(request.operation)) return undefined;
  const { args } = request.operation;
  return isRecord(args) && isStrings(args.messageIds)
    ? args.messageIds
    : undefined;
}

/** Whether a PDS query's data holds a result, as `pdsResult` reads it. */
function hasResult(data: unknown) {
  return (
    isRecord(data) && (data.status === "partial" || data.status === "success")
  );
}

/**
 * The message IDs of a batch query in `cached` that has already loaded
 * and covers `messageId`, such as the one a conversation shows a
 * message's reactions from. `keyOf` gives a batch's query key, so only
 * that kind of query (in that conversation and session) matches. Undefined
 * if none has loaded.
 */
export function loadedBatchWith(
  cached: readonly CachedQuery[],
  keyOf: (messageIds: readonly string[]) => readonly unknown[],
  messageId: string,
) {
  for (const [queryKey, data] of cached) {
    const ids = messageIdsOf(queryKey);
    if (
      ids?.includes(messageId) === true &&
      hasResult(data) &&
      JSON.stringify(keyOf(ids)) === JSON.stringify(queryKey)
    ) {
      return ids;
    }
  }
  return undefined;
}

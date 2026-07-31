import type { Id, TableNames } from "../../src/_generated/dataModel";

/**
 * Cast a string id to `Id<T>` at the boundary between the client wrapper
 * API (string ids, for callers that receive them from HTTP) and the
 * generated `internal.agent.X.Y` function references (typed `Id<T>`).
 * Runtime-valid ids already satisfy both; this is the type-level bridge.
 */
export function asId<T extends TableNames>(id: string) {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return id as Id<T>;
}

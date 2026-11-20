import type { QueryCtx } from "./_generated/server.js";

// Reads a query shares across the channels of a space, so one that lists
// many channels (the inbox, activity) reads each space's rows once rather
// than once per channel. Only for queries: a mutation could change what's
// been read.

export function getSpace(ctx: QueryCtx, spaceId: string) {
  return ctx.db
    .query("spaces")
    .withIndex("by_space", (index) => index.eq("spaceId", spaceId))
    .unique();
}

export function getSpaceMember(
  ctx: QueryCtx,
  spaceId: string,
  accountId: string,
) {
  return ctx.db
    .query("spaceMembers")
    .withIndex("by_space_account", (index) =>
      index.eq("spaceId", spaceId).eq("accountId", accountId),
    )
    .unique();
}

export function spaceMemberAddresses(ctx: QueryCtx, spaceId: string) {
  return ctx.db
    .query("spaceMembers")
    .withIndex("by_space_account", (index) => index.eq("spaceId", spaceId))
    .collect()
    .then((members) => members.map((member) => member.accountId));
}

/** A conversation's space, if it's in one. */
export function spaceOf(
  ctx: QueryCtx,
  spaceId: string | undefined,
  spaces?: SpaceReads,
) {
  if (spaceId === undefined) return null;
  return spaces?.space(spaceId) ?? getSpace(ctx, spaceId);
}

/** A query's reads of spaces, each made once. */
export function spaceReads(ctx: QueryCtx) {
  const read = new Map<string, Promise<unknown>>();
  function once<Value>(key: string, load: () => Promise<Value>) {
    const known = read.get(key);
    // Each key is only ever stored with its own loader's result.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    if (known !== undefined) return known as Promise<Value>;
    const loaded = load();
    read.set(key, loaded);
    return loaded;
  }
  return {
    member: (spaceId: string, accountId: string) =>
      once(`member ${spaceId} ${accountId}`, () =>
        getSpaceMember(ctx, spaceId, accountId),
      ),
    members: (spaceId: string) =>
      once(`members ${spaceId}`, () => spaceMemberAddresses(ctx, spaceId)),
    space: (spaceId: string) =>
      once(`space ${spaceId}`, () => getSpace(ctx, spaceId)),
  };
}

export type SpaceReads = ReturnType<typeof spaceReads>;

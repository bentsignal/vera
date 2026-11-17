import type { MessageRow as BuiltRow } from "../conversation/build-rows.ts";
import type { RowContext } from "./map-rows.ts";

// A direct message's bubbles name no one, since it's just the two of
// them. Once someone else is there, such as Vera called in by an @mention
// (services/backend/convex/summons.ts), it reads like a group, so every
// sender is named and theirs can't be taken for the other person's.

/**
 * The context with every sender shown once someone who isn't one of a
 * direct message's two members (`members`) wrote or is typing there.
 */
export function withGuests(
  rows: readonly BuiltRow[],
  typists: readonly string[],
  context: RowContext,
) {
  const { members } = context;
  if (context.showAuthors || members === undefined) return context;
  function guest(accountId: string) {
    return members?.includes(accountId) === false;
  }
  const present =
    typists.some(guest) ||
    rows.some((row) => row.type === "message" && guest(row.message.authorId));
  return present ? { ...context, showAuthors: true } : context;
}

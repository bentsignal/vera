// How Vera Support reads a closed issue (convex/github.ts): which comment
// says why the team closed it, and which issue a duplicate points to.
// Plain functions, tested in bug-reports.test.ts.

/** How support's own comments on an issue start, so they're never taken for the team's. */
export const SUPPORT_COMMENT = {
  another: "Someone else reported this through Vera Support:",
  more: "More from the reporter:",
} as const;

export interface IssueComment {
  /** GitHub's author association: OWNER, MEMBER, COLLABORATOR, NONE… */
  readonly association: string;
  readonly body: string;
  readonly createdAt: string;
}

/** How far around closing a comment counts as the reason for it. */
const CLOSING_COMMENT_BEFORE = 60 * 60 * 1000;
const CLOSING_COMMENT_AFTER = 10 * 60 * 1000;

/**
 * The team's comment explaining why an issue was closed: the last one from
 * someone on the team, left within an hour before closing or a few
 * minutes after. Not support's own comments.
 */
export function closingCommentOf(
  comments: readonly IssueComment[],
  closedAt: string | null,
) {
  if (closedAt === null) return null;
  const closed = Date.parse(closedAt);
  const comment = comments.findLast((candidate) => {
    const at = Date.parse(candidate.createdAt);
    return (
      ["OWNER", "MEMBER", "COLLABORATOR"].includes(candidate.association) &&
      !Object.values(SUPPORT_COMMENT).some((start) =>
        candidate.body.startsWith(start),
      ) &&
      at >= closed - CLOSING_COMMENT_BEFORE &&
      at <= closed + CLOSING_COMMENT_AFTER
    );
  });
  return comment === undefined ? null : comment.body.slice(0, 2000);
}

export interface DuplicateEvent {
  readonly marked: boolean;
  readonly canonical: number | null;
  readonly duplicate: number | null;
}

/**
 * The issue `self` is a duplicate of, from its timeline (oldest first):
 * the latest marking that wasn't undone. The same events also show where
 * `self` is the original, which don't count.
 */
export function duplicateOf(events: readonly DuplicateEvent[], self: number) {
  let canonical: number | null = null;
  for (const event of events) {
    if (event.duplicate !== self) continue;
    canonical = event.marked ? event.canonical : null;
  }
  return canonical === self ? null : canonical;
}

import type { IssueState, ReportStage } from "../bug-reports";
import type { ActionCtx } from "./_generated/server";
import type { Turn } from "./agentTools";
import type { GitHubConfig } from "./github";
import type { Reporter } from "./supportReporters";
import { anonymize, progressOf } from "../bug-reports";
import { SUPPORT_COMMENT } from "../issue-closures";
import { statusOf } from "../known-bugs";
import { internal } from "./_generated/api";
import { commentOnIssue, githubConfig, issueStates } from "./github";
import { delivered, lazyReleases } from "./githubReleases";
import { whyNotFile } from "./supportRules";

// Following an issue for someone who reported it after someone else
// (`follow_known_bug`, supportLookup.ts): they get a report of their own
// pointing to the same issue, so they hear when it's fixed and when the
// fix is out, exactly like whoever reported it first (supportReports.ts).

/** What to tell someone about a bug they just started following. */
const FOLLOWED: Record<ReportStage, string> = {
  reported:
    "Tell them someone already reported this and the team has it, and that you'll message them here when it's fixed.",
  pickedUp:
    "Tell them someone already reported this and it's being worked on, and that you'll message them here when it's fixed.",
  inProgress:
    "Tell them someone already reported this and a fix is being worked on, and that you'll message them here when it's out.",
  fixed:
    "Tell them someone already reported this and it's fixed, coming in an upcoming update, and that you'll tell them here when it's out.",
  live: "The fix is already out: tell them how to get it (close and reopen Vera, or update it from their app store). If they still see it after that, it may be a different bug.",
  closed:
    "The team closed this without a change linked to it: tell them it was reported before and the team closed it. Don't say it was fixed.",
};

/** For a bug whose fix went out while the team kept its issue open. */
const STILL_OPEN =
  "A fix for this went out, but the team kept it open, so it may not be fully fixed. If they're seeing it on the latest version, tell them it's a known problem and you've passed their report on; otherwise tell them how to get the fix (close and reopen Vera).";

interface FollowInput {
  readonly details?: string;
  readonly issueNumber: number;
  readonly summary: string;
}

export async function followKnownBug(turn: Turn, input: FollowInput) {
  const config = githubConfig();
  if (config === null) {
    return "There's no GitHub here to follow issues on: file it instead.";
  }
  const followed = await issueToFollow(config, input.issueNumber);
  if (followed === null) return "No issue with that number.";
  // Following puts nothing in public, so it never waits for consent; what
  // they told support does.
  const stage = await followIssue(turn.ctx, config, followed.state, {
    accountId: turn.accountId,
    conversationId: turn.conversationId,
    issueNumber: followed.issueNumber,
    summary: input.summary,
  });
  const notAdded =
    input.details === undefined || input.details.trim().length === 0
      ? null
      : await addDetails(turn, config, followed.issueNumber, input.details);
  const stillOpen = followed.state.state === "OPEN";
  return {
    following: true,
    ...(notAdded !== null && {
      detailsNotAdded: `${notAdded} They're following it either way. Only if what they told you is new and would help the team, do that and call follow_known_bug again with it once they answer; otherwise leave it.`,
    }),
    ...(followed.issueNumber !== input.issueNumber && {
      note: `That one was closed as the same as #${String(followed.issueNumber)}, so they follow that instead.`,
    }),
    status: statusOf({ stage, stillOpen }),
    tellThem: stage === "live" && stillOpen ? STILL_OPEN : FOLLOWED[stage],
  };
}

/**
 * The issue to follow and where it stands: the one asked for, or the
 * original when it was closed as the same as another. Null when there's
 * no such issue.
 */
async function issueToFollow(config: GitHubConfig, issueNumber: number) {
  const chosen = await stateOf(config, issueNumber);
  if (chosen === null) return null;
  const duplicateOf = chosen.state === "CLOSED" ? chosen.duplicateOf : null;
  const original =
    duplicateOf === null ? null : await stateOf(config, duplicateOf);
  return duplicateOf === null || original === null
    ? { issueNumber, state: chosen }
    : { issueNumber: duplicateOf, state: original };
}

/** Where an issue stands on GitHub, or null when there's no such issue. */
async function stateOf(config: GitHubConfig, issueNumber: number) {
  return (await issueStates(config, [issueNumber])).get(issueNumber) ?? null;
}

/**
 * Posts what they told support to the issue, once they've had the privacy
 * notice. Returns why it can't yet, or null once it's added.
 */
async function addDetails(
  turn: Turn,
  config: GitHubConfig,
  issueNumber: number,
  details: string,
) {
  const reporter: Reporter = await turn.ctx.runQuery(
    internal.supportReporters.reporter,
    { accountId: turn.accountId },
  );
  const blocked = whyNotFile(turn, reporter);
  if (blocked !== null) return blocked;
  await commentOnIssue(
    config,
    issueNumber,
    `${SUPPORT_COMMENT.another}\n\n${anonymize(details, turn.accountId)}`,
  );
  return null;
}

/**
 * Follows an issue for someone: from where it stands now, they hear in
 * their support conversation as it moves along.
 */
export async function followIssue(
  ctx: ActionCtx,
  config: GitHubConfig,
  state: IssueState,
  {
    accountId,
    conversationId,
    issueNumber,
    summary,
  }: {
    accountId: string;
    conversationId: string;
    issueNumber: number;
    summary: string;
  },
) {
  const found = progressOf(state);
  const progress =
    found.stage === "fixed" && found.fix !== undefined
      ? await delivered(config, await lazyReleases(config)(), found.fix, null)
      : found;
  await ctx.runMutation(internal.supportReports.insert, {
    accountId,
    conversationId,
    issueNumber,
    issueUrl: `https://github.com/${config.owner}/${config.name}/issues/${String(issueNumber)}`,
    stage: progress.stage,
    summary: summary.trim().slice(0, 120),
    title: `#${String(issueNumber)}`,
  });
  return progress.stage;
}

import type { IssueState, ReportStage } from "../bug-reports";
import type { Doc, Id } from "./_generated/dataModel";
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
import { knownBugForIssue } from "./supportBugSync";
import { whyNotFile } from "./supportRules";

// Following a known bug for someone who reported it after someone else
// (`follow_known_bug`, supportLookup.ts): they get a report of their own
// pointing to the same bug, so they hear when it's fixed and when the fix
// is out, exactly like whoever reported it first (supportReports.ts).

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
    "The team closed this without a change: tell them it was reported before and isn't being changed for now.",
};

/** For a bug whose fix went out while the team kept its issue open. */
const STILL_OPEN =
  "A fix for this went out, but the team kept it open, so it may not be fully fixed. If they're seeing it on the latest version, tell them it's a known problem and you've passed their report on; otherwise tell them how to get the fix (close and reopen Vera).";

interface FollowInput {
  readonly bugId?: string;
  readonly details?: string;
  readonly issueNumber?: number;
  readonly summary: string;
}

export async function followKnownBug(turn: Turn, input: FollowInput) {
  const config = githubConfig();
  const chosen = await knownBug(turn.ctx, config, input);
  if (chosen === null) return "No known bug with that ID or issue number.";
  // Closed as the same as another: the original is the one to follow.
  const original =
    chosen.duplicateOf === undefined
      ? null
      : await knownBugForIssue(turn.ctx, config, chosen.duplicateOf);
  const bug = original ?? chosen;
  // Following puts nothing in public, so it never waits for consent; what
  // they told support does.
  const stage = await follow(turn, config, bug, input.summary);
  const notAdded =
    input.details === undefined || input.details.trim().length === 0
      ? null
      : await addDetails(turn, config, bug, input.details);
  return {
    following: true,
    ...(notAdded !== null && {
      detailsNotAdded: `${notAdded} They're following it either way. Only if what they told you is new and would help the team, do that and call follow_known_bug again with it once they answer; otherwise leave it.`,
    }),
    ...(original !== null && {
      note: `That one was closed as the same as #${String(original.issueNumber)}, so they follow that instead.`,
    }),
    status: statusOf({
      duplicateOf: bug.duplicateOf,
      stage,
      stillOpen: bug.active,
    }),
    tellThem: stage === "live" && bug.active ? STILL_OPEN : FOLLOWED[stage],
  };
}

function knownBug(
  ctx: ActionCtx,
  config: GitHubConfig | null,
  { bugId, issueNumber }: FollowInput,
): Promise<Doc<"knownBugs"> | null> {
  if (bugId !== undefined) {
    return ctx.runQuery(internal.supportKnownBugs.find, { bugId });
  }
  if (issueNumber === undefined) return Promise.resolve(null);
  return knownBugForIssue(ctx, config, issueNumber);
}

/**
 * Posts what they told support to the bug's issue, once they've had the
 * privacy notice. Returns why it can't yet, or null once it's added.
 */
async function addDetails(
  turn: Turn,
  config: GitHubConfig | null,
  bug: Doc<"knownBugs">,
  details: string,
) {
  const reporter: Reporter = await turn.ctx.runQuery(
    internal.supportReporters.reporter,
    { accountId: turn.accountId },
  );
  const blocked = whyNotFile(turn, reporter);
  if (blocked !== null) return blocked;
  const comment = `${SUPPORT_COMMENT.another}\n\n${anonymize(details, turn.accountId)}`;
  if (config === null || bug.issueNumber === undefined) {
    console.log(
      `GitHub isn't set up; not adding to "${bug.title}".\n\n${comment}`,
    );
  } else {
    await commentOnIssue(config, bug.issueNumber, comment);
  }
  return null;
}

/** Follows a bug for them: from its issue's state now, or as it's known. */
async function follow(
  turn: Turn,
  config: GitHubConfig | null,
  bug: Doc<"knownBugs">,
  summary: string,
) {
  const following = {
    accountId: turn.accountId,
    bug: bug._id,
    conversationId: turn.conversationId,
    summary,
  };
  if (config !== null && bug.issueNumber !== undefined) {
    const state = (await issueStates(config, [bug.issueNumber])).get(
      bug.issueNumber,
    );
    if (state !== undefined) {
      return followIssue(turn.ctx, config, state, {
        ...following,
        issueNumber: bug.issueNumber,
      });
    }
  }
  await turn.ctx.runMutation(internal.supportReports.insert, {
    ...following,
    issueNumber: bug.issueNumber,
    issueUrl: bug.issueUrl,
    stage: bug.stage,
    summary: summary.trim().slice(0, 120),
    title:
      bug.issueNumber === undefined ? bug.title : `#${String(bug.issueNumber)}`,
  });
  return bug.stage;
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
    bug,
    conversationId,
    issueNumber,
    summary,
  }: {
    accountId: string;
    bug?: Id<"knownBugs">;
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
    bug,
    conversationId,
    issueNumber,
    issueUrl: `https://github.com/${config.owner}/${config.name}/issues/${String(issueNumber)}`,
    stage: progress.stage,
    summary: summary.trim().slice(0, 120),
    title: `#${String(issueNumber)}`,
  });
  return progress.stage;
}

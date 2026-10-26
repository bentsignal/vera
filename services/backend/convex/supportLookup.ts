import { tool } from "ai";
import { z } from "zod/v4";

import type { ActionCtx } from "./_generated/server";
import type { Turn } from "./agentTools";
import type { GitHubConfig } from "./github";
import type { Releases } from "./githubReleases";
import type { SearchedBug } from "./supportKnownBugs";
import { releaseNeeds } from "../bug-reports";
import {
  briefOf,
  isOpenBug,
  keywordMatches,
  statusOf,
} from "../known-bugs";
import { internal } from "./_generated/api";
import { githubConfig, pullRequestFix, searchRepository } from "./github";
import { delivered, lazyReleases } from "./githubReleases";
import { followKnownBug } from "./supportFollow";

// Support's tools for what the team already knows: whether a problem was
// reported or fixed before, and following a known bug instead of filing a
// duplicate (supportFollow.ts). Known bugs live in Convex (supportKnownBugs.ts), so one filed
// a minute ago is there; GitHub's search is only a fallback, for merged
// fixes and anything the sync hasn't read yet. The open ones are in
// support's instructions (supportAgent.ts), which the prompt cache keeps
// from reply to reply; a tool's results are sent anew, at full price,
// every reply that needs them.

/** Merged pull requests checked for whether they've shipped, per search. */
const CHECKED_FIXES = 3;

/**
 * What this reply has seen of the known bugs, which filing checks against
 * (supportAgent.ts): the open ones in its instructions, as of `at`, and
 * any it found since.
 */
export interface KnownBugCheck {
  readonly at: number;
  readonly seen: Set<string>;
}

export function lookupTools(turn: Turn, check: KnownBugCheck) {
  return {
    search_known_bugs: tool({
      description:
        "Search older bugs by keywords: closed and fixed ones, and merged fixes. The open ones are already in your instructions.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("A few keywords, like 'photo sideways group'."),
      }),
      execute: ({ query }) => searchKnownBugs(turn.ctx, check, query),
    }),
    follow_known_bug: tool({
      description:
        "Follow a known bug for this person instead of filing a duplicate: they hear here when it's fixed and when the fix is out, the same as whoever reported it first. Optionally add what they told you to it.",
      inputSchema: z.object({
        bugId: z
          .string()
          .optional()
          .describe("The known bug's id from search_known_bugs."),
        issueNumber: z
          .number()
          .optional()
          .describe(
            "Or a GitHub issue's number, for one found only on GitHub.",
          ),
        summary: z
          .string()
          .describe("A short everyday phrase for the reporter."),
        details: z
          .string()
          .optional()
          .describe(
            "Anything new they told you, for developers, posted publicly. Leave out if nothing new.",
          ),
      }),
      execute: (input) => followKnownBug(turn, input),
    }),
  };
}

async function searchKnownBugs(
  ctx: ActionCtx,
  check: KnownBugCheck,
  query: string,
) {
  const bugs: SearchedBug[] = await ctx.runQuery(
    internal.supportKnownBugs.forSearch,
    {},
  );
  const matches = keywordMatches(
    bugs.filter((bug) => !isOpenBug(bug)),
    query,
  );
  for (const bug of matches) check.seen.add(bug._id);
  const known = new Set(bugs.map((bug) => bug.issueNumber));
  return {
    olderMatches: matches.map(describe),
    github: await searchGitHub(query, known),
  };
}

/** A known bug as the model sees it. */
function describe(bug: SearchedBug) {
  return {
    id: bug._id,
    issue: bug.issueNumber ?? null,
    kind: bug.kind,
    title: bug.title,
    ...(bug.summary !== undefined && { summary: bug.summary }),
    about: briefOf(bug.description),
    status: statusOf({ ...bug, stillOpen: bug.active }),
    ...(bug.duplicateOf !== undefined && { duplicateOf: bug.duplicateOf }),
    reported: new Date(bug.reportedAt).toISOString().slice(0, 10),
    ...(bug.followers > 0 && { following: bug.followers }),
  };
}

/** GitHub's search, for merged fixes and issues not known here yet. */
async function searchGitHub(query: string, known: Set<number | undefined>) {
  const config = githubConfig();
  if (config === null) return "Not available here.";
  try {
    const found = await searchRepository(config, query);
    const releases = lazyReleases(config);
    const fixes = await Promise.all(
      found.pullRequests.slice(0, CHECKED_FIXES).map(async (pr) => ({
        ...pr,
        status: await shipped(config, releases, pr.number),
      })),
    );
    return {
      fixes,
      issues: found.issues
        .filter((issue) => !known.has(issue.number))
        .map((issue) => ({
          ...issue,
          state:
            issue.state === "open"
              ? "open"
              : `closed (${(issue.stateReason ?? "completed").replace("_", " ")})`,
        })),
    };
  } catch (error) {
    console.error("GitHub search failed", error);
    return "Not available right now.";
  }
}

async function shipped(
  config: GitHubConfig,
  releases: () => Promise<Releases>,
  number: number,
) {
  const { mergeCommit, native, paths } = await pullRequestFix(config, number);
  if (mergeCommit === null) return "not merged";
  const result = await delivered(
    config,
    await releases(),
    { ...releaseNeeds(paths), native, sha: mergeCommit },
    null,
  );
  if (result.stage !== "live") return "merged, not released yet";
  return result.delivery === "build"
    ? "out in the newest store version (they update from their app store)"
    : "live (shipped over the air; they already have it)";
}

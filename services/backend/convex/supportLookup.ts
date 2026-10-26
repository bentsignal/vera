import { tool } from "ai";
import { z } from "zod/v4";

import type { ActionCtx } from "./_generated/server";
import type { Turn } from "./agentTools";
import type { GitHubConfig } from "./github";
import type { Releases } from "./githubReleases";
import type { SearchedBug } from "./supportKnownBugs";
import { releaseNeeds } from "../bug-reports";
import { briefOf, keywordMatches, statusOf } from "../known-bugs";
import { internal } from "./_generated/api";
import { githubConfig, pullRequestFix, searchRepository } from "./github";
import { delivered, lazyReleases } from "./githubReleases";
import { followKnownBug } from "./supportFollow";

// Support's tools for what the team already knows: whether a problem was
// reported or fixed before, and following a known bug instead of filing a
// duplicate (supportFollow.ts). Known bugs live in Convex (supportKnownBugs.ts), so one filed
// a minute ago is there; GitHub's search is only a fallback, for merged
// fixes and anything the sync hasn't read yet.

/** Merged pull requests checked for whether they've shipped, per search. */
const CHECKED_FIXES = 3;

/**
 * This reply's look at the known bugs, which filing needs first
 * (supportAgent.ts): when it was, and which bugs it showed.
 */
export interface KnownBugCheck {
  at: number | null;
  readonly seen: Set<string>;
}

export function newCheck(): KnownBugCheck {
  return { at: null, seen: new Set() };
}

export function lookupTools(turn: Turn, check: KnownBugCheck) {
  return {
    search_known_bugs: tool({
      description:
        "Check what the team already knows, before filing: every open bug and idea (compare each with this problem by meaning, not wording), plus closed and fixed ones and merged fixes that match your keywords. Required in the same reply as file_bug_report.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "A few keywords for older and fixed bugs, like 'photo sideways group'.",
          ),
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
  const at = Date.now();
  const bugs: SearchedBug[] = await ctx.runQuery(
    internal.supportKnownBugs.forSearch,
    {},
  );
  const open = bugs.filter(isOpen);
  const settled = bugs.filter((bug) => !isOpen(bug));
  const matches = keywordMatches(settled, query);
  for (const bug of [...open, ...matches]) check.seen.add(bug._id);
  check.at = at;
  const known = new Set(bugs.map((bug) => bug.issueNumber));
  return {
    open: open.map(describe),
    olderMatches: matches.map(describe),
    github: await searchGitHub(query, known),
    howToJudge:
      "Compare by what goes wrong, not by wording: the same symptom in the same place is the same bug, however differently it's described. When one matches, follow_known_bug it instead of filing.",
  };
}

/**
 * Open on GitHub, or a fix still on its way (`active`), but not one that
 * just closed and is waiting for its check.
 */
function isOpen(bug: SearchedBug) {
  return bug.active && bug.stage !== "closed";
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

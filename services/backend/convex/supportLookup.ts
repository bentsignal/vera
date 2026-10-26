import { tool } from "ai";
import { z } from "zod/v4";

import type { IssueState } from "../bug-reports";
import type { Turn } from "./agentTools";
import type { GitHubConfig } from "./github";
import type { Releases } from "./githubReleases";
import { progressOf, releaseNeeds } from "../bug-reports";
import { briefOf, statusOf } from "../known-bugs";
import {
  githubConfig,
  issueStates,
  pullRequestFix,
  searchRepository,
} from "./github";
import { issuesChangedSince } from "./githubIssues";
import { delivered, lazyReleases } from "./githubReleases";
import { followKnownBug } from "./supportFollow";

// Support's tools for what the team already knows. GitHub's issues are the
// one record of bugs: support searches them before filing and follows a
// match instead of filing a duplicate (supportFollow.ts). GitHub's search
// can take a while to see a new issue, so ones filed in the last day come
// from the issue list too, which has them at once.

/** Merged pull requests checked for whether they've shipped, per search. */
const CHECKED_FIXES = 3;

/** How far back the issue list covers what search may not see yet. */
const RECENT = 24 * 60 * 60 * 1000;

/**
 * This reply's look at GitHub, which filing needs first (supportAgent.ts):
 * when it was, and which issues it showed.
 */
export interface KnownBugCheck {
  at: number | null;
  readonly seen: Set<number>;
}

export function newCheck(): KnownBugCheck {
  return { at: null, seen: new Set() };
}

export function lookupTools(turn: Turn, check: KnownBugCheck) {
  return {
    search_known_bugs: tool({
      description:
        "Search the team's bug reports and ideas on GitHub, before filing: issues matching your keywords (open and closed), every issue filed in the last day, and merged fixes. Compare by meaning, not wording. Required in the same reply as file_bug_report.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("A few keywords, like 'photo sideways group'."),
      }),
      execute: ({ query }) => searchKnownBugs(check, query),
    }),
    follow_known_bug: tool({
      description:
        "Follow a GitHub issue for this person instead of filing a duplicate: they hear here when it's fixed and when the fix is out, the same as whoever reported it first. Optionally add what they told you to it.",
      inputSchema: z.object({
        issueNumber: z
          .number()
          .describe("The issue's number, from search_known_bugs."),
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

async function searchKnownBugs(check: KnownBugCheck, query: string) {
  const config = githubConfig();
  if (config === null) {
    return "There's no GitHub here, so nothing to check against: file it if it's worth filing.";
  }
  const at = Date.now();
  try {
    const [found, recent] = await Promise.all([
      searchRepository(config, query),
      filedSince(config, at - RECENT),
    ]);
    const numbers = [
      ...new Set([
        ...recent.map((issue) => issue.number),
        ...found.issues.map((issue) => issue.number),
      ]),
    ];
    const issues = [...recent, ...found.issues].filter(
      (issue, index, all) =>
        all.findIndex((other) => other.number === issue.number) === index,
    );
    const releases = lazyReleases(config);
    const states = await issueStates(config, numbers);
    check.at = at;
    for (const number of numbers) check.seen.add(number);
    return {
      issues: await Promise.all(
        issues.map(async (issue) => ({
          issue: issue.number,
          title: issue.title,
          about: issue.about,
          status: await statusFor(config, releases, states.get(issue.number)),
          reported: issue.createdAt.slice(0, 10),
        })),
      ),
      fixes: await Promise.all(
        found.pullRequests.slice(0, CHECKED_FIXES).map(async (pr) => ({
          ...pr,
          status: await shipped(config, releases, pr.number),
        })),
      ),
    };
  } catch (error) {
    console.error("GitHub search failed", error);
    return "GitHub isn't answering right now. Tell them you'll pass it on, and try again in a moment.";
  }
}

/** Issues filed at or after `since`, as search lists them. */
export async function filedSince(config: GitHubConfig, since: number) {
  const changed = await issuesChangedSince(config, since);
  return changed
    .filter((issue) => issue.createdAt >= since)
    .map((issue) => ({
      about: briefOf(issue.body),
      createdAt: new Date(issue.createdAt).toISOString(),
      number: issue.number,
      title: issue.title,
    }));
}

/** Where an issue stands, in words, with whether its fix is out yet. */
async function statusFor(
  config: GitHubConfig,
  releases: () => Promise<Releases>,
  state: IssueState | undefined,
) {
  if (state === undefined) return "unknown";
  const found = progressOf(state);
  const stage =
    found.stage === "fixed" && found.fix !== undefined
      ? (await delivered(config, await releases(), found.fix, null)).stage
      : found.stage;
  const status = statusOf({
    duplicateOf: state.duplicateOf ?? undefined,
    stage,
    stillOpen: state.state === "OPEN",
  });
  return state.duplicateOf === null
    ? status
    : `${status} (the same as #${String(state.duplicateOf)})`;
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

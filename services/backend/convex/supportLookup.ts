import { tool } from "ai";
import { z } from "zod/v4";

import type { IssueState } from "../bug-reports";
import type { Turn } from "./agentTools";
import type { GitHubConfig } from "./github";
import type { Releases } from "./githubReleases";
import { IDEA_LABEL, progressOf, releaseNeeds } from "../bug-reports";
import { briefOf, statusOf } from "../known-bugs";
import {
  githubConfig,
  issueStates,
  pullRequestFix,
  searchRepository,
} from "./github";
import { issuesChangedSince, openIssues } from "./githubIssues";
import { delivered, lazyReleases } from "./githubReleases";
import { followKnownBug } from "./supportFollow";

// Vera's tools for what the team already knows. GitHub's issues are the
// one record of bugs: Vera checks them before filing and follows a match
// instead of filing a duplicate (supportFollow.ts). It gets every open
// issue's title, to compare by meaning, since keywords miss the same bug
// in other words (#350 duplicated #343: "reconnecting" against "retry"),
// and keyword matches among closed ones too. The open list comes from
// GitHub's issue list, which has a new issue at once; search can take a
// while to see one.

/** Merged pull requests checked for whether they've shipped, per search. */
const CHECKED_FIXES = 3;

/**
 * This reply's look at GitHub, which filing needs first (supportAgent.ts):
 * when it was, which issues it showed, and whether the reply has filed or
 * followed one since.
 */
export interface KnownBugCheck {
  acted: boolean;
  at: number | null;
  readonly seen: Set<number>;
}

export function newCheck(): KnownBugCheck {
  return { acted: false, at: null, seen: new Set() };
}

export function lookupTools(turn: Turn, check: KnownBugCheck) {
  return {
    search_known_bugs: tool({
      description:
        "Check the team's bug reports and ideas on GitHub, before filing: every open one by title (allOpen), open and closed ones matching any of your keywords (matches), and merged fixes. Compare their problem with all of them by meaning, not wording. Required in the same reply as file_bug_report.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("A few keywords, like 'photo sideways group'."),
      }),
      execute: ({ query }) => searchKnownBugs(check, query),
    }),
    follow_known_bug: tool({
      description:
        "Follow a GitHub issue for this person instead of filing a duplicate: they hear here when it's fixed and when the fix is out, the same as whoever reported it first. Call it before your reply, as soon as one matches. Optionally add what they told you to it.",
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
      execute: async (input) => {
        const result = await followKnownBug(turn, input);
        if (typeof result !== "string") check.acted = true;
        return result;
      },
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
    const [found, open] = await Promise.all([
      // Search has a tighter rate limit than the issue list (30 a minute);
      // the open list alone still catches most duplicates.
      searchRepository(config, query).catch((error: unknown) => {
        console.error("GitHub search failed", error);
        return { issues: [], pullRequests: [] };
      }),
      openIssues(config),
    ]);
    const numbers = found.issues.map((issue) => issue.number);
    const releases = lazyReleases(config);
    const states = await issueStates(config, numbers);
    check.at = at;
    for (const number of numbers) check.seen.add(number);
    for (const issue of open) check.seen.add(issue.number);
    return {
      matches: await Promise.all(
        found.issues.map(async (issue) => ({
          issue: issue.number,
          title: issue.title,
          about: issue.about,
          link: issue.url,
          status: await statusFor(config, releases, states.get(issue.number)),
          reported: issue.createdAt.slice(0, 10),
        })),
      ),
      allOpen: open.map(
        (issue) =>
          `#${String(issue.number)} ${issue.title}${issue.labels.includes(IDEA_LABEL) && !issue.title.startsWith("Idea:") ? " (idea)" : ""}`,
      ),
      fixes: await Promise.all(
        found.pullRequests.slice(0, CHECKED_FIXES).map(async (pr) => ({
          ...pr,
          status: await shipped(config, releases, pr.number),
        })),
      ),
    };
  } catch (error) {
    console.error("Couldn't list GitHub's issues", error);
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
      url: issue.url,
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

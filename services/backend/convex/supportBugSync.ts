import type { Infer } from "convex/values";
import { v } from "convex/values";

import type { IssueState, ReportStage } from "../bug-reports";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import type { GitHubConfig } from "./github";
import type { GitHubIssue } from "./githubIssues";
import type { Releases } from "./githubReleases";
import { isFinalStage, progressOf } from "../bug-reports";
import { importedStage, kindOf } from "../known-bugs";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { githubConfig } from "./github";
import { issueByNumber, issuesChangedSince } from "./githubIssues";
import { delivered } from "./githubReleases";
import { byIssue, DESCRIPTION_LENGTH } from "./supportKnownBugs";

// Keeps support's known bugs (supportKnownBugs.ts) in step with GitHub:
// each check (supportReports.ts `track`) reads the issues changed since the
// last one, so issues the team files themselves are known too, then where
// each open one stands. Reports support filed before known bugs were kept
// are linked to theirs (`backfill`).

const issueValidator = v.object({
  body: v.string(),
  closedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  labels: v.array(v.string()),
  number: v.number(),
  open: v.boolean(),
  stateReason: v.union(v.string(), v.null()),
  title: v.string(),
  updatedAt: v.number(),
  url: v.string(),
});

/**
 * Brings issues read from GitHub into the known bugs: new ones are added,
 * known ones get the team's edits, and a reopened one is checked again.
 */
export const upsertIssues = internalMutation({
  args: { issues: v.array(issueValidator) },
  handler: async (ctx, { issues }) => {
    for (const issue of issues) await upsertIssue(ctx, issue);
  },
});

async function upsertIssue(
  ctx: MutationCtx,
  issue: Infer<typeof issueValidator>,
) {
  const content = {
    description: issue.body.slice(0, DESCRIPTION_LENGTH),
    githubUpdatedAt: issue.updatedAt,
    issueUrl: issue.url,
    title: issue.title.slice(0, 200),
  };
  const existing = await byIssue(ctx, issue.number);
  if (existing !== null) {
    await ctx.db.patch(existing._id, {
      ...content,
      // Reopened, or closed since: the next check reads where it stands.
      active: issue.open !== !isFinalStage(existing.stage) || existing.active,
    });
    return;
  }
  const reports = await ctx.db
    .query("bugReports")
    .withIndex("by_issue", (q) => q.eq("issueNumber", issue.number))
    .take(100);
  // Filed by support before known bugs were kept: the first reporter's
  // words (followers' reports are titled "#<number>").
  const filed = reports.find((report) => !report.title.startsWith("#"));
  const bug = await ctx.db.insert("knownBugs", {
    ...content,
    ...importedStage(issue, Date.now()),
    issueNumber: issue.number,
    kind: kindOf(issue.labels),
    reportedAt: issue.createdAt,
    summary: filed?.summary,
  });
  for (const report of reports) await ctx.db.patch(report._id, { bug });
}

/**
 * Records where each known bug's issue stands now, when that changed:
 * its stage (fixed and out once it's in the releases, for any phone) and
 * the issue it duplicates. Part of each check (supportReports.ts `track`).
 */
export async function checkKnownBugs(
  ctx: ActionCtx,
  config: GitHubConfig,
  releases: () => Promise<Releases>,
  bugs: readonly {
    duplicateOf?: number;
    id: Id<"knownBugs">;
    issueNumber: number;
    stage: ReportStage;
  }[],
  states: ReadonlyMap<number, IssueState>,
) {
  for (const bug of bugs) {
    const state = states.get(bug.issueNumber);
    if (state === undefined) {
      await ctx.runMutation(internal.supportKnownBugs.recordProgress, {
        bugId: bug.id,
        found: false,
        open: false,
        stage: bug.stage,
      });
      continue;
    }
    const duplicateOf =
      state.state === "CLOSED" ? (state.duplicateOf ?? undefined) : undefined;
    const stage =
      duplicateOf === undefined
        ? await stageOf(config, releases, state)
        : "closed";
    const open = state.state === "OPEN";
    const changed =
      stage !== bug.stage ||
      duplicateOf !== bug.duplicateOf ||
      (isFinalStage(stage) && !open);
    if (!changed) continue;
    await ctx.runMutation(internal.supportKnownBugs.recordProgress, {
      bugId: bug.id,
      duplicateOf,
      found: true,
      open,
      stage,
    });
  }
}

async function stageOf(
  config: GitHubConfig,
  releases: () => Promise<Releases>,
  state: IssueState,
) {
  const found = progressOf(state);
  if (found.stage !== "fixed" || found.fix === undefined) return found.stage;
  return (await delivered(config, await releases(), found.fix, null)).stage;
}

/** Where the next sync starts: the latest change already synced. */
export const syncedThrough = internalQuery({
  args: {},
  handler: async (ctx) => {
    const latest = await ctx.db
      .query("knownBugs")
      .withIndex("by_github_updated", (q) => q.gt("githubUpdatedAt", 0))
      .order("desc")
      .first();
    return latest?.githubUpdatedAt ?? null;
  },
});

/** Issues per mutation when syncing. */
const UPSERT_BATCH = 50;

/**
 * Reads every issue changed on GitHub since the last sync (or, with
 * `everything`, every issue) into the known bugs: the ones support filed,
 * and ones the team filed themselves.
 */
export async function syncKnownBugs(
  ctx: ActionCtx,
  config: GitHubConfig,
  { everything = false } = {},
) {
  const since: number | null = everything
    ? null
    : await ctx.runQuery(internal.supportBugSync.syncedThrough, {});
  const issues = await issuesChangedSince(config, since);
  await saveIssues(ctx, issues);
  return issues.length;
}

async function saveIssues(ctx: ActionCtx, issues: readonly GitHubIssue[]) {
  for (let start = 0; start < issues.length; start += UPSERT_BATCH) {
    await ctx.runMutation(internal.supportBugSync.upsertIssues, {
      issues: issues
        .slice(start, start + UPSERT_BATCH)
        .map((issue) => ({ ...issue, labels: [...issue.labels] })),
    });
  }
}

/**
 * The known bug for an issue, read from GitHub now if it isn't known yet
 * (one filed since the last sync, outside support). Null if there's no
 * such issue.
 */
export async function knownBugForIssue(
  ctx: ActionCtx,
  config: GitHubConfig | null,
  issueNumber: number,
): Promise<Doc<"knownBugs"> | null> {
  const known = await ctx.runQuery(internal.supportKnownBugs.find, {
    issueNumber,
  });
  if (known !== null || config === null) return known;
  const issue = await issueByNumber(config, issueNumber);
  if (issue === null) return null;
  await saveIssues(ctx, [issue]);
  return ctx.runQuery(internal.supportKnownBugs.find, { issueNumber });
}

/**
 * Links reports from before known bugs were kept to theirs, making known
 * bugs for reports kept on this PDS without GitHub. Safe to run again.
 */
export const linkReports = internalMutation({
  args: {},
  handler: async (ctx) => {
    const reports = await ctx.db.query("bugReports").take(1000);
    let linked = 0;
    for (const report of reports) {
      if (report.bug !== undefined) continue;
      const known =
        report.issueNumber === undefined
          ? null
          : await byIssue(ctx, report.issueNumber);
      const bug =
        known?._id ??
        (await ctx.db.insert("knownBugs", {
          // Checked against its issue next (`track`), when it has one.
          active:
            report.issueNumber !== undefined || !isFinalStage(report.stage),
          description: "",
          issueNumber: report.issueNumber,
          issueUrl: report.issueUrl,
          kind: report.title.startsWith("Idea:") ? "idea" : "bug",
          reportedAt: report._creationTime,
          stage: report.stage,
          summary: report.title.startsWith("#") ? undefined : report.summary,
          title: report.title,
        }));
      await ctx.db.patch(report._id, { bug });
      linked++;
    }
    return { linked };
  },
});

/**
 * Operator command, once per deployment after this shipped:
 * `npx convex run supportBugSync:backfill`. Imports every GitHub issue,
 * links the reports support filed before, and checks where each stands.
 * Safe to run again.
 */
export const backfill = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ checked: number; imported: number; linked: number }> => {
    const config = githubConfig();
    const imported =
      config === null
        ? 0
        : await syncKnownBugs(ctx, config, { everything: true });
    const { linked } = await ctx.runMutation(
      internal.supportBugSync.linkReports,
      {},
    );
    const { checked } = await ctx.runAction(internal.supportReports.track, {});
    return { checked, imported, linked };
  },
});

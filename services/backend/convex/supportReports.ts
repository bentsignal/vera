import type { Infer } from "convex/values";
import { v } from "convex/values";

import type { IssueState, Platform } from "../bug-reports";
import type { Doc } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import type { GitHubConfig } from "./github";
import type { Releases } from "./githubReleases";
import {
  isFinalStage,
  isNewStage,
  platformOf,
  progressOf,
  updateMessage,
} from "../bug-reports";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { sendAsBot, SUPPORT } from "./bots";
import { githubConfig, issueStates } from "./github";
import { delivered, lazyReleases } from "./githubReleases";
import { reportStage } from "./schema";
import { checkKnownBugs, syncKnownBugs } from "./supportBugSync";
import { explainClosure } from "./supportClosures";

// The bug reports Vera Support files (supportAgent.ts) and how they're
// going. A cron (crons.ts) reads each open report's GitHub issue and tells
// the reporter, in plain words, when someone picks it up, when a fix is
// being worked on, when it's fixed, and when the fix is out. "Out" means
// the fix's commit is in the newest production release tags (see
// docs/releasing.md): an update or store build for app changes, a backend
// deploy for backend changes. Each row is one person following one known
// bug (supportKnownBugs.ts): whoever reported it first, and anyone who
// reported the same thing after, all hear the same updates.

/**
 * A report to follow: a new issue support filed, or (with `stage`) an
 * existing one someone else reported first, which they hear about from
 * where it is now.
 */
export const insert = internalMutation({
  args: {
    accountId: v.string(),
    bug: v.optional(v.id("knownBugs")),
    conversationId: v.string(),
    issueNumber: v.optional(v.number()),
    issueUrl: v.optional(v.string()),
    stage: v.optional(reportStage),
    summary: v.string(),
    title: v.string(),
  },
  handler: async (ctx, { stage = "reported", ...args }) => {
    const theirs = await ctx.db
      .query("bugReports")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    const same = theirs.find(
      (report) =>
        (args.issueNumber !== undefined &&
          report.issueNumber === args.issueNumber) ||
        (args.bug !== undefined && report.bug === args.bug),
    );
    if (same !== undefined) return same._id;
    return ctx.db.insert("bugReports", {
      ...args,
      notifiedStage: stage,
      stage,
      tracking: args.issueNumber !== undefined && !isFinalStage(stage),
    });
  },
});

/** A reporter's own reports, newest first. */
export const reportsOf = internalQuery({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }) => {
    const rows = await ctx.db
      .query("bugReports")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .order("desc")
      .take(20);
    return rows.map(publicReport);
  },
});

/** One of this reporter's reports, or null if it isn't theirs. */
export const reportOf = internalQuery({
  args: { accountId: v.string(), reportId: v.string() },
  handler: async (ctx, { accountId, reportId }) => {
    const id = ctx.db.normalizeId("bugReports", reportId);
    const report = id === null ? null : await ctx.db.get(id);
    return report?.accountId === accountId ? publicReport(report) : null;
  },
});

export type PublicReport = ReturnType<typeof publicReport>;

function publicReport(report: Doc<"bugReports">) {
  return {
    createdAt: report._creationTime,
    id: report._id,
    issueNumber: report.issueNumber ?? null,
    issueUrl: report.issueUrl ?? null,
    pullRequestUrl: report.pullRequest?.url ?? null,
    stage: report.stage,
    summary: report.summary,
    title: report.title,
  };
}

/** Reports still being followed, each with the reporter's phone. */
export const tracked = internalQuery({
  args: {},
  handler: async (ctx) => {
    const reports = await ctx.db
      .query("bugReports")
      .withIndex("by_tracking", (q) => q.eq("tracking", true))
      .take(100);
    return Promise.all(
      reports.map(async (report) => ({
        ...report,
        platform: await platformFor(ctx, report.accountId),
      })),
    );
  },
});

/** The reporter's phone, from the OS their app last reported. */
async function platformFor(ctx: QueryCtx, accountId: string) {
  const client = await ctx.db
    .query("clientInfo")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .unique();
  return platformOf(client?.os);
}

const progressValidator = v.object({
  delivery: v.optional(
    v.union(
      v.literal("update"),
      v.literal("build"),
      v.literal("server"),
      v.literal("unknown"),
    ),
  ),
  fix: v.optional(
    v.object({
      app: v.boolean(),
      backend: v.boolean(),
      native: v.optional(v.boolean()),
      sha: v.string(),
    }),
  ),
  pullRequest: v.optional(v.object({ number: v.number(), url: v.string() })),
  release: v.optional(v.string()),
  stage: reportStage,
  stateReason: v.optional(v.union(v.null(), v.string())),
  /** Why the team closed it, in their words (supportClosures.ts). */
  closingComment: v.optional(v.string()),
});

type Progress = Infer<typeof progressValidator>;

/**
 * Records a report's progress and, when it reached a stage the reporter
 * hasn't heard about, tells them. A report that skipped stages gets only
 * the latest; one that went backwards (a reopened issue) gets nothing.
 */
export const advance = internalMutation({
  args: { progress: progressValidator, reportId: v.id("bugReports") },
  handler: async (ctx, { progress, reportId }) => {
    const report = await ctx.db.get(reportId);
    if (report === null) return;
    const notify = isNewStage(report.notifiedStage, progress.stage);
    const updated = {
      ...report,
      fix: progress.fix ?? report.fix,
      notifiedStage: notify ? progress.stage : report.notifiedStage,
      pullRequest: progress.pullRequest ?? report.pullRequest,
      stage: progress.stage,
      tracking: !isFinalStage(progress.stage),
    };
    await ctx.db.replace(reportId, updated);
    if (!notify) return;
    if (progress.stage === "closed" && progress.closingComment !== undefined) {
      await explainClosure(ctx, updated, {
        comment: progress.closingComment,
        stateReason: progress.stateReason,
      });
    } else {
      await tellReporter(ctx, updated, progress);
    }
  },
});

/** Sends the reporter the message for their report's new stage. */
async function tellReporter(
  ctx: MutationCtx,
  report: Doc<"bugReports">,
  progress: Progress,
) {
  const reporter = await ctx.db
    .query("supportReporters")
    .withIndex("by_account", (q) => q.eq("accountId", report.accountId))
    .unique();
  const message = updateMessage(report.stage, {
    ...progress,
    developer: reporter?.developer === true,
    platform: await platformFor(ctx, report.accountId),
    issueUrl: report.issueUrl,
    pullRequest: report.pullRequest,
    sha: report.fix?.sha,
    summary: report.summary,
  });
  if (message !== null) {
    await sendAsBot(ctx, SUPPORT, report.conversationId, message);
  }
}

/**
 * Checks every open report's issue on GitHub (crons.ts runs it). Also an
 * operator command: `npx convex run supportReports:track`.
 */
export const track = internalAction({
  args: {},
  handler: async (ctx): Promise<{ checked: number }> => {
    const config = githubConfig();
    if (config === null) return { checked: 0 };
    try {
      await syncKnownBugs(ctx, config);
    } catch (error) {
      // Reporters still hear about their own reports.
      console.error("Couldn't sync known bugs from GitHub", error);
    }
    const [reports, bugs] = await Promise.all([
      ctx.runQuery(internal.supportReports.tracked, {}),
      ctx.runQuery(internal.supportKnownBugs.toCheck, {}),
    ]);
    const numbered = reports.flatMap((report) =>
      report.issueNumber === undefined
        ? []
        : [{ ...report, issueNumber: report.issueNumber }],
    );
    const states = await issueStates(config, [
      ...numbered.map((report) => report.issueNumber),
      ...bugs.map((bug) => bug.issueNumber),
    ]);
    const releases = lazyReleases(config);
    await checkKnownBugs(ctx, config, releases, bugs, states);
    for (const report of numbered) {
      const state = states.get(report.issueNumber);
      if (state !== undefined) {
        await checkReport(ctx, config, releases, report, state);
      }
    }
    return { checked: numbered.length + bugs.length };
  },
});

/**
 * Tells a report's follower what moved on its issue, or moves them onto
 * the original when it was closed as a duplicate.
 */
async function checkReport(
  ctx: ActionCtx,
  config: GitHubConfig,
  releases: () => Promise<Releases>,
  report: Doc<"bugReports"> & { platform: Platform },
  state: IssueState,
) {
  if (state.state === "CLOSED" && state.duplicateOf !== null) {
    await ctx.runMutation(internal.supportClosures.followOriginal, {
      issueNumber: state.duplicateOf,
      issueUrl: `https://github.com/${config.owner}/${config.name}/issues/${String(state.duplicateOf)}`,
      reportId: report._id,
    });
    return;
  }
  const update = await progressFrom(config, releases, state, report.platform);
  if (hasNews(report, update)) {
    await ctx.runMutation(internal.supportReports.advance, {
      progress: update,
      reportId: report._id,
    });
  }
}

/** Whether a report's issue moved since the last check. */
function hasNews(report: Doc<"bugReports">, update: Progress) {
  return (
    update.stage !== report.stage ||
    update.stage !== report.notifiedStage ||
    update.pullRequest?.url !== report.pullRequest?.url
  );
}

/** A report's progress from its issue, and for a fix, whether it's out. */
async function progressFrom(
  config: GitHubConfig,
  releases: () => Promise<Releases>,
  state: IssueState,
  platform: Platform,
): Promise<Progress> {
  const found = progressOf(state);
  const base = { ...found, stateReason: state.stateReason };
  if (found.stage === "fixed" && found.fix !== undefined) {
    return {
      ...base,
      ...(await delivered(config, await releases(), found.fix, platform)),
    };
  }
  if (found.stage === "closed" && state.closingComment !== null) {
    return { ...base, closingComment: state.closingComment };
  }
  return found.stage === "live" ? { ...base, delivery: "unknown" } : base;
}

/**
 * Operator command: `npx convex run supportReports:list`. Every report,
 * newest first, with who sent it, for Shawn and his agents only (the
 * public issue never names the reporter).
 */
export const list = internalQuery({
  args: { open: v.optional(v.boolean()) },
  handler: async (ctx, { open }) => {
    const rows =
      open === true
        ? await ctx.db
            .query("bugReports")
            .withIndex("by_tracking", (q) => q.eq("tracking", true))
            .order("desc")
            .take(100)
        : await ctx.db.query("bugReports").order("desc").take(100);
    return rows.map((report) => ({
      ...publicReport(report),
      conversationId: report.conversationId,
      reporter: report.accountId,
    }));
  },
});

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { isFinalStage } from "../bug-reports";
import { internalMutation, internalQuery } from "./_generated/server";
import { reportStage } from "./schema";

// The team's known bugs, in Convex: every issue support filed, and every
// other issue on GitHub, synced by the "follow bug reports" cron
// (supportBugSync.ts, from supportReports.ts `track`). Support checks these
// before filing (supportLookup.ts), so a report filed a minute ago is
// already there, unlike in GitHub's search. Each person following a bug has a bugReports
// row pointing to it (`bug`), which is how they hear it's fixed and out.

/** How much of an issue's description is kept to compare reports against. */
export const DESCRIPTION_LENGTH = 2000;

/** Support filed a report: from now on it's known, for the next person. */
export const record = internalMutation({
  args: {
    description: v.string(),
    issueNumber: v.optional(v.number()),
    issueUrl: v.optional(v.string()),
    kind: v.union(v.literal("bug"), v.literal("idea")),
    summary: v.string(),
    title: v.string(),
  },
  handler: async (ctx, { description, ...args }) => {
    // The sync may have read the new issue in already.
    const synced =
      args.issueNumber === undefined
        ? null
        : await byIssue(ctx, args.issueNumber);
    if (synced !== null) {
      await ctx.db.patch(synced._id, {
        kind: args.kind,
        summary: args.summary,
      });
      return synced._id;
    }
    return ctx.db.insert("knownBugs", {
      ...args,
      active: true,
      description: description.slice(0, DESCRIPTION_LENGTH),
      reportedAt: Date.now(),
      stage: "reported",
    });
  },
});

/**
 * Every known bug, most recently reported first, each open one with its
 * follower count.
 */
export const forSearch = internalQuery({
  args: {},
  handler: async (ctx) => {
    const bugs = await ctx.db.query("knownBugs").take(2000);
    const counted = await Promise.all(
      bugs.map(async (bug) => ({
        ...bug,
        followers: bug.active ? await followerCount(ctx, bug._id) : 0,
      })),
    );
    return counted.sort((a, b) => b.reportedAt - a.reportedAt);
  },
});

export type SearchedBug = Doc<"knownBugs"> & { followers: number };

async function followerCount(ctx: QueryCtx, bug: Id<"knownBugs">) {
  const followers = await ctx.db
    .query("bugReports")
    .withIndex("by_bug", (q) => q.eq("bug", bug))
    .take(100);
  return followers.length;
}

/** Bugs that became known after `since`, such as one filed during a check. */
export const knownSince = internalQuery({
  args: { since: v.number() },
  handler: (ctx, { since }) =>
    ctx.db
      .query("knownBugs")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", since))
      .take(20),
});

/** A known bug by our ID or its issue number, or null. */
export const find = internalQuery({
  args: { bugId: v.optional(v.string()), issueNumber: v.optional(v.number()) },
  handler: async (ctx, { bugId, issueNumber }) => {
    if (bugId !== undefined) {
      const id = ctx.db.normalizeId("knownBugs", bugId);
      return id === null ? null : ctx.db.get(id);
    }
    if (issueNumber === undefined) return null;
    return byIssue(ctx, issueNumber);
  },
});

export function byIssue(ctx: QueryCtx, issueNumber: number) {
  return ctx.db
    .query("knownBugs")
    .withIndex("by_issue", (q) => q.eq("issueNumber", issueNumber))
    .first();
}

/** Bugs whose issues still need checking (`track`). */
export const toCheck = internalQuery({
  args: {},
  handler: async (ctx) => {
    const bugs = await ctx.db
      .query("knownBugs")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(500);
    return bugs.flatMap((bug) =>
      bug.issueNumber === undefined
        ? []
        : [
            {
              duplicateOf: bug.duplicateOf,
              id: bug._id,
              issueNumber: bug.issueNumber,
              stage: bug.stage,
            },
          ],
    );
  },
});

/** What a check of the issue found (`track`). */
export const recordProgress = internalMutation({
  args: {
    bugId: v.id("knownBugs"),
    duplicateOf: v.optional(v.number()),
    /** Its issue is still open, so it's still checked and still listed. */
    open: v.boolean(),
    found: v.boolean(),
    stage: reportStage,
  },
  handler: async (ctx, { bugId, duplicateOf, found, open, stage }) => {
    await ctx.db.patch(
      bugId,
      // A deleted or moved issue has nothing more to check.
      found
        ? { active: open || !isFinalStage(stage), duplicateOf, stage }
        : { active: false },
    );
  },
});

/**
 * Operator command: `npx convex run supportKnownBugs:list '{"open":true}'`.
 * Known bugs, newest first, with who follows each, for Shawn and his
 * agents only.
 */
export const list = internalQuery({
  args: { open: v.optional(v.boolean()) },
  handler: async (ctx, { open }) => {
    const bugs =
      open === true
        ? await ctx.db
            .query("knownBugs")
            .withIndex("by_active", (q) => q.eq("active", true))
            .order("desc")
            .take(200)
        : await ctx.db.query("knownBugs").order("desc").take(200);
    return Promise.all(
      bugs.map(async (bug) => ({
        duplicateOf: bug.duplicateOf ?? null,
        followers: (
          await ctx.db
            .query("bugReports")
            .withIndex("by_bug", (q) => q.eq("bug", bug._id))
            .take(100)
        ).map((report) => ({
          conversationId: report.conversationId,
          reporter: report.accountId,
          stage: report.stage,
        })),
        id: bug._id,
        issueNumber: bug.issueNumber ?? null,
        issueUrl: bug.issueUrl ?? null,
        kind: bug.kind,
        stage: bug.stage,
        summary: bug.summary ?? null,
        title: bug.title,
      })),
    );
  },
});

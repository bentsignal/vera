import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { scheduleReply } from "./assistantHook";
import { sendAsBot, VERA } from "./bots";

// When the team closes a report's issue without fixing it (supportReports.ts
// `track`), the reporter shouldn't just hear "closed":
//
// - Closed as a duplicate of another issue: Vera follows that one for them
//   instead, from where it is now.
// - Closed with a comment from the team: Vera's model explains it in plain
//   words, and follows another issue if the comment points to one.
// - Otherwise, the closed message in bug-reports.ts.
//
// Closed as completed counts here too when no fix closed it: that's also
// how the team turns down an idea, so Vera never calls it done.

/**
 * Moves a report onto the issue it duplicates, and tells the reporter.
 * The next check (`track`) catches them up on where that issue stands.
 */
export const followOriginal = internalMutation({
  args: {
    idea: v.optional(v.boolean()),
    issueNumber: v.number(),
    issueUrl: v.string(),
    reportId: v.id("bugReports"),
  },
  handler: async (ctx, { idea, issueNumber, issueUrl, reportId }) => {
    const report = await ctx.db.get(reportId);
    if (report === null) return;
    const theirs = await ctx.db
      .query("bugReports")
      .withIndex("by_account", (q) => q.eq("accountId", report.accountId))
      .collect();
    const already = theirs.some((other) => other.issueNumber === issueNumber);
    if (already) {
      // They're already following the original: nothing new to say.
      await ctx.db.patch(reportId, {
        notifiedStage: "closed",
        stage: "closed",
        tracking: false,
      });
      return;
    }
    await ctx.db.replace(reportId, {
      accountId: report.accountId,
      conversationId: report.conversationId,
      issueNumber,
      issueUrl,
      notifiedStage: "reported",
      stage: "reported",
      summary: report.summary,
      title: `#${String(issueNumber)}`,
      tracking: true,
    });
    const developer = await isDeveloper(ctx, report.accountId);
    await sendAsBot(
      ctx,
      VERA,
      report.conversationId,
      [
        idea === true
          ? `Update on the idea you suggested (${report.summary}): it turned out to be the same as another idea the team has, so I'll follow that one for you and let you know when it's done.`
          : `Update on the bug you reported (${report.summary}): it turned out to be the same as another report the team is tracking, so I'll follow that one for you and let you know when it's fixed.`,
        ...(developer ? [issueUrl] : []),
      ].join("\n"),
    );
  },
});

/** Has Vera's model tell the reporter why their report was closed. */
export async function explainClosure(
  ctx: MutationCtx,
  report: Doc<"bugReports">,
  {
    comment,
    idea,
    stateReason,
  }: { comment: string; idea: boolean; stateReason?: string | null },
) {
  const kind = idea ? "idea" : "bug report";
  const how =
    stateReason === "DUPLICATE"
      ? "as the same as another report"
      : stateReason === "NOT_PLANNED"
        ? "without a change (the team isn't planning to change it for now)"
        : `as completed, but no change to Vera came with it: unless the comment says otherwise, the team decided against it`;
  await scheduleReply(ctx, {
    accountId: report.accountId,
    bot: VERA.username,
    conversationId: report.conversationId,
    note: `Their ${kind} "${report.summary}" (issue #${String(report.issueNumber)}) was just closed ${how}. The team's closing comment:

"""
${comment}
"""

Tell them what happened and why, in plain words, going only by that comment. Don't argue with it or promise anything it doesn't, and don't say it was ${idea ? "built or done" : "fixed"} unless the comment says so. Don't explain how you know or what wasn't said. If it points to another report that's still open or being worked on, follow_known_bug that one for them and say you'll keep them posted. One message, or two if you're following another report for them.`,
    wakeAt: Date.now(),
  });
}

async function isDeveloper(ctx: MutationCtx, accountId: string) {
  const reporter = await ctx.db
    .query("supportReporters")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .unique();
  return reporter?.developer === true;
}

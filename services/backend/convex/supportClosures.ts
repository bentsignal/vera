import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { scheduleReply } from "./assistantHook";
import { sendAsBot, SUPPORT } from "./bots";

// When the team closes a report's issue without fixing it (supportReports.ts
// `track`), the reporter shouldn't just hear "closed":
//
// - Closed as a duplicate of another issue: support follows that one for
//   them instead, from where it is now.
// - Closed with a comment from the team: support's model explains it in
//   plain words, and follows another issue if the comment points to one.
// - Otherwise, the fixed message in bug-reports.ts.

/**
 * Moves a report onto the issue it duplicates, and tells the reporter.
 * The next check (`track`) catches them up on where that issue stands.
 */
export const followOriginal = internalMutation({
  args: {
    issueNumber: v.number(),
    issueUrl: v.string(),
    reportId: v.id("bugReports"),
  },
  handler: async (ctx, { issueNumber, issueUrl, reportId }) => {
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
    const original = await ctx.db
      .query("knownBugs")
      .withIndex("by_issue", (q) => q.eq("issueNumber", issueNumber))
      .first();
    await ctx.db.replace(reportId, {
      accountId: report.accountId,
      bug: original?._id,
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
      SUPPORT,
      report.conversationId,
      [
        `Update on the bug you reported (${report.summary}): it turned out to be the same as another report the team is tracking, so I'll follow that one for you and let you know when it's fixed.`,
        ...(developer ? [issueUrl] : []),
      ].join("\n"),
    );
  },
});

/** Has support's model tell the reporter why their report was closed. */
export async function explainClosure(
  ctx: MutationCtx,
  report: Doc<"bugReports">,
  { comment, stateReason }: { comment: string; stateReason?: string | null },
) {
  const how =
    stateReason === "DUPLICATE"
      ? "as the same as another report"
      : "without a change (the team isn't planning to change it for now)";
  await scheduleReply(ctx, {
    accountId: report.accountId,
    bot: SUPPORT.username,
    conversationId: report.conversationId,
    note: `Their report "${report.summary}" (issue #${String(report.issueNumber)}) was just closed ${how}. The team's closing comment:

"""
${comment}
"""

Tell them what happened and why, in plain words, going only by that comment. Don't argue with it or promise anything it doesn't. If it points to another report that's still open or being worked on, follow_known_bug that one for them and say you'll keep them posted. One or two messages.`,
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

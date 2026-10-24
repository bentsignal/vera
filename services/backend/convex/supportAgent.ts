import { tool } from "ai";
import { z } from "zod/v4";

import type { Assistant } from "./agent";
import type { Turn } from "./agentTools";
import type { KnownBugCheck } from "./supportLookup";
import type { Reporter } from "./supportReporters";
import type { PublicReport } from "./supportReports";
import { anonymize, issueFor } from "../bug-reports";
import { SUPPORT_COMMENT } from "../issue-closures";
import { briefOf } from "../known-bugs";
import { internal } from "./_generated/api";
import { conversationTools, sharedInstructions } from "./agentTools";
import { commentOnIssue, createIssue, githubConfig } from "./github";
import { lookupTools, newCheck } from "./supportLookup";
import { noticeShared, PRIVACY_NOTICE, whyNotFile } from "./supportRules";

// Vera Support's model: it helps someone describe a bug well, files it as a
// public, anonymized GitHub issue, and answers questions about their
// reports. Updates as a fix moves along come from supportReports.ts, not
// the model.

const STAGE_WORDS = {
  closed: "closed (not being changed, or the same as another report)",
  fixed: "fixed, waiting to go out in an update",
  inProgress: "a fix is being worked on",
  live: "fixed and out",
  pickedUp: "someone on the team picked it up",
  reported: "reported, waiting for someone to pick it up",
} as const;

export const supportAssistant: Assistant = {
  instructions: async (turn) => {
    const [reporter, reports]: [Reporter, PublicReport[]] = await Promise.all([
      turn.ctx.runQuery(internal.supportReporters.reporter, {
        accountId: turn.accountId,
      }),
      turn.ctx.runQuery(internal.supportReports.reportsOf, {
        accountId: turn.accountId,
      }),
    ]);
    const app =
      reporter.client === null
        ? "Unknown. If it matters, ask them to open More > About and tell you the Version and Update lines."
        : `Version ${reporter.client.appVersion}, update ${reporter.client.update} (${reporter.client.channel}), ${reporter.client.device}, ${reporter.client.os}. This is attached to reports automatically; don't ask for it.`;
    const developer =
      reporter.developer === null
        ? "unknown"
        : reporter.developer
          ? "yes"
          : "no";
    const reportList =
      reports.length === 0
        ? "None."
        : reports
            .map(
              (report) =>
                `- [${report.id}] ${report.summary}: ${STAGE_WORDS[report.stage]}${reporter.developer === true ? `. ${linksOf(report)}` : ""}`,
            )
            .join("\n");
    return `${sharedInstructions(turn)}

You are Vera Support. People message you when something in the Vera app isn't working. Your job: understand the problem well enough for the team to fix it, file it, and keep them in the loop. Be warm, brief, and plain-spoken.

Getting a good report:
- Find out what went wrong, where in the app it happened, what they expected instead, and how to make it happen again (or whether it keeps happening). A screenshot or screen recording helps a lot; ask for one when it would.
- If they're vague ("something's broken"), ask what they were doing and what they saw. Ask one or two things at a time, not a checklist. Don't over-ask: once you know what happened and where, that's enough to file.
- Never ask for their messages, contacts, passwords, or other personal information. You only need to know what the app did.

Privacy, before anything is filed:
- Reports are public. The first time, call share_privacy_notice when you ask for a screenshot, or, once you have enough and search_known_bugs found nothing that matches, before filing; it sends the notice for you, so don't repeat it in your own words. Ask whether they're OK with you sending the report to the team and wait for their answer: you can only file after they've replied to the notice.
- Once they've seen the notice and gone ahead, that's their consent for later reports too. Don't share it or ask permission again; just file when you have enough.
- Screenshots never go in a report. Describe what each one shows about the app instead, precisely enough that a developer could picture it: which screen, what's on it, what looks wrong.
- In everything you file, never include their name or username, anyone else's name, message contents, faces, addresses, phone numbers, or links, including what you read in a screenshot. Describe instead ("a message from a friend", "a link to a video").

Checking what the team already knows:
- Once you understand the problem, search_known_bugs first, before the privacy notice: following a known bug puts nothing in public, so it doesn't need their consent (adding their details to it does). Search again in the reply you file in. It lists every open bug and idea; read them all and compare by meaning: the same thing going wrong in the same place is the same bug, however differently it's worded (say "messages out of order when opening a chat" and "an older message shows at the bottom"). Keywords only find older, closed, and fixed ones; try another set if those matter and the first finds nothing.
- A known bug that matches, open or fixed but not out yet: follow_known_bug instead of filing a new one, adding anything new they told you. Then tell them someone already reported it, where it stands, and that you'll message them here when it's fixed.
- A fix that's already out: tell them, and how to get it (close and reopen the app, or update it). A fix merged but not released yet: tell them it's coming in an upcoming update, and follow its issue if it has one.
- Judge by what the bug or fix actually says, and by dates: a fix from before they reported it didn't fix their problem.
- Only when nothing matches, file it.

Filing:
- Use file_bug_report once you have enough and nothing known matches. Write the title and details for a developer: specific, factual, concise. Write the summary for them: a short everyday phrase like "photos showing sideways in group chats".
- Feature requests and ideas are welcome too; file them with kind "idea".
- Everything you file is public, so use judgment: don't file jokes, tests, insults, or spam, and don't file what's already known. If they're clearly just messing around, don't file anything.
- After filing, tell them in plain words that you passed it to the team and will message them here when it's fixed. Don't promise when.
- More details about something already filed go to add_to_bug_report, not a new report.

Talking about it:
- Their developer status: ${developer}. If unknown, after you file their first report, ask once, casually, whether they're a developer, since you can share the technical details as the fix moves along; record the answer with set_developer.
- If they're not a developer (or unknown), keep it non-technical: say "bug report" or "passed it to the team", never "issue", "GitHub", "ticket", "PR", or "merged".
- If they are a developer, you can be technical and share the links listed with their reports below. Only those links: never make up a link, issue number, or ID.
- If they ask how to do something in the app and you're not sure, say so. Don't invent features.

Privacy notice: ${noticeShared(reporter) ? "already shared; don't share it or ask permission again" : "never shared; share it before filing"}.

Their app: ${app}

Their reports (newest first):
${reportList}`;
  },
  tools: (turn: Turn) => {
    const check = newCheck();
    return {
      ...conversationTools(turn),
      ...lookupTools(turn, check),
      share_privacy_notice: tool({
        description:
          "Send the notice that reports are public and screenshots are described, not posted. Required before file_bug_report.",
        inputSchema: z.object({}),
        execute: async () => {
          await turn.send(PRIVACY_NOTICE, { canned: true });
          await turn.ctx.runMutation(internal.supportReporters.updateReporter, {
            accountId: turn.accountId,
            noticeShared: true,
          });
          return "Sent.";
        },
      }),
      set_developer: tool({
        description:
          "Record whether this person is a developer who wants technical details.",
        inputSchema: z.object({ developer: z.boolean() }),
        execute: async ({ developer }) => {
          await turn.ctx.runMutation(internal.supportReporters.updateReporter, {
            accountId: turn.accountId,
            developer,
          });
          return "Saved.";
        },
      }),
      file_bug_report: tool({
        description:
          "File a bug report (or idea) for the team. It becomes a public, anonymized GitHub issue with their app version attached.",
        inputSchema: z.object({
          kind: z.enum(["bug", "idea"]),
          title: z.string().describe("A short, specific title for developers."),
          summary: z
            .string()
            .describe(
              "A short everyday phrase for the reporter, like 'photos showing sideways in group chats'.",
            ),
          details: z
            .string()
            .describe(
              "What happened, for developers, including what any screenshots show about the app, in words.",
            ),
          steps: z.string().optional().describe("How to make it happen."),
          expected: z.string().optional(),
          actual: z.string().optional(),
        }),
        execute: (input) => fileBugReport(turn, check, input),
      }),
      add_to_bug_report: tool({
        description:
          "Add details to one of their reports that's already filed.",
        inputSchema: z.object({
          reportId: z.string(),
          details: z.string(),
        }),
        execute: (input) => addToBugReport(turn, input),
      }),
    };
  },
};

interface BugReportInput {
  readonly actual?: string;
  readonly details: string;
  readonly expected?: string;
  readonly kind: "bug" | "idea";
  readonly steps?: string;
  readonly summary: string;
  readonly title: string;
}

/**
 * Files a report as a public, anonymized issue, keeps it to follow, and
 * makes it a known bug for the next person who reports it.
 */
async function fileBugReport(
  turn: Turn,
  check: KnownBugCheck,
  input: BugReportInput,
) {
  const reporter: Reporter = await turn.ctx.runQuery(
    internal.supportReporters.reporter,
    { accountId: turn.accountId },
  );
  const blocked = whyNotFile(turn, reporter);
  if (blocked !== null) return blocked;
  const unchecked = await uncheckedBugs(turn, check);
  if (unchecked !== null) return unchecked;
  const issue = issueFor(input, turn.accountId, reporter.client);
  const title = input.kind === "idea" ? `Idea: ${issue.title}` : issue.title;
  const created = await openIssue(input.kind, title, issue.body);
  const filed = {
    issueNumber: created?.number,
    issueUrl: created?.url,
    summary: input.summary.trim().slice(0, 120),
    title,
  };
  const bug = await turn.ctx.runMutation(internal.supportKnownBugs.record, {
    ...filed,
    description: issue.body,
    kind: input.kind,
  });
  check.seen.add(bug);
  const reportId = await turn.ctx.runMutation(internal.supportReports.insert, {
    ...filed,
    accountId: turn.accountId,
    bug,
    conversationId: turn.conversationId,
  });
  return {
    filed: true,
    reportId,
    link:
      reporter.developer !== true
        ? "Not for this person (not a developer)."
        : (created?.url ?? "None; it's kept privately."),
  };
}

/** How long before a check a bug still counts as new to it. */
const CHECK_OVERLAP = 60_000;

/**
 * Why filing has to wait for a look at the known bugs, or null when it's
 * had one: none yet in this reply, or bugs reported since (by someone
 * else, moments ago) that it hasn't seen.
 */
async function uncheckedBugs(turn: Turn, check: KnownBugCheck) {
  if (check.at === null) {
    return "Not filed: call search_known_bugs first, and follow a known bug instead if one matches.";
  }
  const recent = await turn.ctx.runQuery(internal.supportKnownBugs.knownSince, {
    since: check.at - CHECK_OVERLAP,
  });
  const unseen = recent.filter((bug) => !check.seen.has(bug._id));
  if (unseen.length === 0) return null;
  for (const bug of unseen) check.seen.add(bug._id);
  return {
    filed: false,
    reason:
      "Someone just reported these while you were checking. If one is the same problem, follow_known_bug it instead; otherwise call file_bug_report again.",
    justReported: unseen.map((bug) => ({
      id: bug._id,
      issue: bug.issueNumber ?? null,
      title: bug.title,
      about: briefOf(bug.description),
    })),
  };
}

/** The new GitHub issue, or null when GitHub isn't set up or refused. */
async function openIssue(kind: "bug" | "idea", title: string, body: string) {
  const config = githubConfig();
  if (config === null) {
    console.log(
      `GitHub isn't set up; keeping the report on this PDS only.\n# ${title}\n\n${body}`,
    );
    return null;
  }
  try {
    return await createIssue(config, {
      body,
      labels: [kind === "idea" ? "enhancement" : "bug", "user report"],
      title,
    });
  } catch (error) {
    console.error("Couldn't create the GitHub issue", error);
    return null;
  }
}

/** Adds details to one of the person's own reports, as an issue comment. */
async function addToBugReport(
  turn: Turn,
  { details, reportId }: { details: string; reportId: string },
) {
  const report: PublicReport | null = await turn.ctx.runQuery(
    internal.supportReports.reportOf,
    { accountId: turn.accountId, reportId },
  );
  if (report === null) return "No report of theirs with that ID.";
  const config = githubConfig();
  if (config === null || report.issueNumber === null) {
    return "Noted, but this report can't take more details right now.";
  }
  const body = [
    SUPPORT_COMMENT.more,
    "",
    anonymize(details, turn.accountId),
  ].join("\n");
  await commentOnIssue(config, report.issueNumber, body);
  return "Added.";
}

/** A developer's links for a report, or that it has none. */
function linksOf(report: PublicReport) {
  if (report.issueUrl === null) return "No public link (kept privately)";
  return report.pullRequestUrl === null
    ? `Issue: ${report.issueUrl}`
    : `Issue: ${report.issueUrl}, fix: ${report.pullRequestUrl}`;
}

import type { ReplyRules, Turn } from "./agentTools";
import type { KnownBugCheck } from "./supportLookup";
import type { Reporter } from "./supportReporters";
import { claimsFiled } from "../reply-claims";
import { internal } from "./_generated/api";

// What has to be true before Vera puts a bug report in public: the
// person was told reports are public (a reply marked `notice`,
// `replyRules` below), and answered after. Whether
// something is worth filing at all (not a joke, a test, or spam) is the
// model's call; the hourly limit (rateLimits.ts) bounds the rest.

/**
 * Whether they've had the privacy notice. Once they've seen it and gone
 * ahead, that consent carries over to later reports (#179): Vera
 * doesn't ask again.
 */
export function noticeShared(reporter: Reporter) {
  return reporter.noticeSharedAt !== null;
}

/** Why a report can't be filed right now, or null when it can. */
export function whyNotFile(turn: Turn, reporter: Reporter) {
  if (!noticeShared(reporter)) {
    return "Not filed: nothing was sent to the team. They haven't been told reports are public yet. Don't say it's filed: tell them reports are posted publicly and ask whether it's OK to send it, with notice set on your reply, then wait for their answer.";
  }
  // They get to see the notice, and decide what to share, before anything
  // goes public.
  if ((reporter.noticeSharedAt ?? 0) > turn.lastHeardAt) {
    return "Not filed: nothing was sent to the team. They haven't answered since you told them reports are public; don't say it's filed. Wait for their reply.";
  }
  return null;
}

/**
 * What Vera's reply must say or mustn't about reports:
 * - Before anything is filed, that reports are public: a reply marked
 *   `notice`, in Vera's own words, offered only until they've been told
 *   (offered after, Haiku said it again).
 * - That a report went to the team, only when this reply filed or
 *   followed one: Haiku and Kimi sometimes said they'd passed it on
 *   without filing anything (2026-11-17).
 */
export function replyRules(
  turn: Turn,
  reporter: Reporter,
  check: KnownBugCheck,
): ReplyRules {
  // Once: a false alarm (a report from before, say) costs a rewrite, not
  // the whole reply.
  let warned = false;
  return {
    notice: noticeShared(reporter)
      ? null
      : {
          describe:
            "True when this reply tells them bug reports are posted publicly (required once before filing).",
          shared: async () => {
            await turn.ctx.runMutation(
              internal.supportReporters.updateReporter,
              { accountId: turn.accountId, noticeShared: true },
            );
          },
        },
    refuse: (messages, marked) => {
      if (marked && !messages.some((text) => /\bpublic/i.test(text))) {
        return "Not sent: with notice set, your reply has to tell them bug reports are posted publicly.";
      }
      if (!warned && !check.acted && claimsFiled(messages)) {
        warned = true;
        return "Not sent: nothing was filed or followed in this reply, so don't say it was sent, filed, or passed to the team. If it's ready to file, ask whether it's OK to send it.";
      }
      return null;
    },
  };
}

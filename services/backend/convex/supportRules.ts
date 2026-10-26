import type { Turn } from "./agentTools";
import type { Reporter } from "./supportReporters";

// What has to be true before Vera Support puts anything in public: the
// person was told reports are public, and answered after. Whether
// something is worth filing at all (not a joke, a test, or spam) is the
// model's call; the hourly limit (rateLimits.ts) bounds the rest.

/** Sent word for word before anything is filed (`share_privacy_notice`). */
export const PRIVACY_NOTICE =
  "Heads up: bug reports are posted publicly online so the team can work on them. Screenshots aren't posted; I describe what they show in words and leave out personal details, but I can't promise to catch everything, so please cross out anything private (names, messages, faces) before you send one.";

/**
 * Whether they've had the privacy notice. Once they've seen it and gone
 * ahead, that consent carries over to later reports (#179): support
 * doesn't ask again.
 */
export function noticeShared(reporter: Reporter) {
  return reporter.noticeSharedAt !== null;
}

/** Why a report can't be filed right now, or null when it can. */
export function whyNotFile(turn: Turn, reporter: Reporter) {
  if (!noticeShared(reporter)) {
    return "Not filed: call share_privacy_notice first, and let them answer before filing.";
  }
  // They get to see the notice, and decide what to share, before anything
  // goes public.
  if ((reporter.noticeSharedAt ?? 0) > turn.lastHeardAt) {
    return "Not filed yet: they haven't answered since the privacy notice. Wait for their reply.";
  }
  return null;
}

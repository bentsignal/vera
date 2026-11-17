// What an assistant's reply says it did or will do that it hasn't
// (convex/agentTools.ts `replyTool`, convex/supportRules.ts): such a reply
// is sent back, once, for the model to act first or say it differently.

// Models write both ' and ’ (Kimi uses ’).
const FILED =
  /\b(?:passed|passing|sent|sending|filed|filing|submitted|submitting)\b/i;
const TO_TEAM = /\b(?:team|bug report)\b/i;
const FOLLOWED =
  /\bI(?:['’]ve| have|['’]m| am)? (?:followed|following|added you|added your|linked you|linked your)\b/i;

function statements(messages: readonly string[]) {
  return messages
    .flatMap((text) => text.split(/(?<=[.!?])\s+/))
    .filter((sentence) => !sentence.trim().endsWith("?"));
}

/**
 * Whether messages say a report went to the team ("I passed it to the
 * team") or was followed ("I've followed it"), not counting questions
 * ("OK if I send it to the team?"). Haiku and Kimi sometimes said so when
 * they had done neither (2026-11-17).
 */
export function claimsFiled(messages: readonly string[]) {
  return statements(messages).some(
    (sentence) =>
      (FILED.test(sentence) && TO_TEAM.test(sentence)) ||
      FOLLOWED.test(sentence),
  );
}

const UPDATE_PROMISE =
  /\b(?:I['’]ll|I will|we['’]ll)\s+(?:message|tell|let you know|update|ping|notify)\b[^.!?]*\b(?:when|once|as soon as)\b[^.!?]*\b(?:fixed|resolved|fix (?:is|ships|lands))\b/i;

/**
 * Whether messages promise word when it's fixed ("I'll message you here
 * when it's fixed"). Only following a report makes that happen; Haiku
 * promised it after finding a report it never followed (2026-11-17).
 */
export function promisesUpdates(messages: readonly string[]) {
  return statements(messages).some((sentence) => UPDATE_PROMISE.test(sentence));
}

const PROMISE_TO_CHECK =
  /\b(?:let me|I['’]ll|I will|I['’]m going to)\s+(?:check|look|search|see|find|dig)\b/i;

/**
 * Whether a reply says it's about to look something up ("Let me check
 * whether someone has already reported it."). Nothing runs after a reply,
 * so that check never comes; the model's tools run before it (Haiku did,
 * 2026-11-17).
 */
export function promisesToCheck(messages: readonly string[]) {
  return messages.some((text) => PROMISE_TO_CHECK.test(text));
}

/** What the model reads when its reply only promised to look. */
export const CHECK_FIRST =
  "Not sent: nothing happens after your reply, so don't say you'll check or look something up. Use your tools now, then reply with what you found.";

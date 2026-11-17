// Whether a reply in an assistant's thread is meant for it
// (convex/summonThreads.ts). Jev, a cheap decision model, reads the thread
// and picks the new reply meant for the assistant, if any, before the main
// model runs: most replies there are people talking to each other, and
// judging one costs about a thousandth of an answer.

/** The decision model, pinned: `jev-latest` moves. */
export const GATE_MODEL = "typesafe/jev-1.14";

/** The most messages it reads, newest last. */
const SHOWN = 20;
/** Each message's text is cut to this many characters. */
const TEXT_LENGTH = 500;

export interface GateMessage {
  readonly from: string;
  readonly messageId: string;
  readonly sentAt: number;
  readonly text: string;
}

const NONE = "none";

/**
 * The decision request: the thread with the new replies marked, each
 * labeled `m1`, `m2`… (oldest first), and one choice among the new ones
 * or `none`. `labels` maps a label back to its message.
 */
export function gateRequest(
  assistant: string,
  thread: readonly GateMessage[],
  fresh: readonly string[],
  now: number,
) {
  const shown = thread.slice(-SHOWN);
  const labels = new Map(
    shown.map((message, index) => [`m${index + 1}`, message] as const),
  );
  const freshLabels = [...labels]
    .filter(([, message]) => fresh.includes(message.messageId))
    .map(([label]) => label);
  const criteria: Record<string, string> = {};
  for (const label of freshLabels) {
    criteria[label] =
      `${labels.get(label)?.from}'s message ${label} is for ${assistant}`;
  }
  criteria[NONE] = `None of the new messages is for ${assistant}`;
  return {
    labels,
    request: {
      questions: {
        forAssistant: {
          type: "choice" as const,
          instructions: `Which new message, if any, is meant for ${assistant} to answer now: a question or request to ${assistant}, or a follow-up to what ${assistant} said that expects an answer from ${assistant}. Messages people send each other (chatting, reacting, thanking, joking, asking each other something) are not for ${assistant}, and neither is anything ${assistant} already answered. When people are going back and forth quickly with each other, pick a message only if it is clearly for ${assistant}.`,
          criteria,
        },
      },
      state: {
        assistant: `${assistant}, an AI assistant someone called into this thread`,
        thread: [...labels].map(([label, message]) => ({
          id: label,
          from: message.from,
          secondsAgo: Math.max(0, Math.round((now - message.sentAt) / 1000)),
          text: message.text.slice(0, TEXT_LENGTH),
        })),
        newMessages: freshLabels,
      },
    },
  };
}

/** The message the gate chose, or null for none (or a label it wasn't offered). */
export function gateChoice(
  choice: string,
  labels: ReadonlyMap<string, GateMessage>,
  fresh: readonly string[],
) {
  if (choice === NONE) return null;
  const chosen = labels.get(choice);
  return chosen !== undefined && fresh.includes(chosen.messageId)
    ? chosen
    : null;
}

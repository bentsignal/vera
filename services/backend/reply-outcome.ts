// How an assistant's reply ended (convex/agent.ts). The model talks to the
// person only through tools: `send_message`, and canned messages like
// support's privacy notice. Anything it writes outside a tool is never
// sent. A reply that ends without sending anything or calling
// `stay_quiet` is an error, and the model gets its turn back.

export type ReplyOutcome = "answered" | "quiet" | "noToolCall";

export function replyOutcome(
  steps: readonly { readonly toolCalls: readonly { toolName: string }[] }[],
  sent: number,
): ReplyOutcome {
  if (sent > 0) return "answered";
  const quiet = steps.some((step) =>
    step.toolCalls.some((call) => call.toolName === "stay_quiet"),
  );
  return quiet ? "quiet" : "noToolCall";
}

/** What the model reads when its reply ended without a tool call. */
export const NO_TOOL_CALL =
  "Your last response wasn't sent: they only see what you send with send_message, never text written outside a tool. Answer them with send_message now, or call stay_quiet to send nothing.";

import type { StepResult, StopCondition, ToolSet } from "ai";

export async function willContinue<TOOLS extends ToolSet>(
  steps: StepResult<TOOLS>[],
  stopWhen: StopCondition<TOOLS> | StopCondition<TOOLS>[] | undefined,
) {
  const step = steps.at(-1);
  if (!step) return false;
  if (step.finishReason !== "tool-calls") return false;
  if (step.toolCalls.length > step.toolResults.length) return false;
  if (Array.isArray(stopWhen)) {
    const results = await Promise.all(stopWhen.map(async (s) => s({ steps })));
    return results.every((stop) => !stop);
  }
  return !!stopWhen && !(await stopWhen({ steps }));
}

export function errorToString(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

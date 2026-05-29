import type { ActionCtx } from "../../_generated/server";
import type { ErrorCode } from "./error_codes";
import { internal } from "../../_generated/api";
import { logSystemError } from "../thread/helpers";
import { ConvexCallError } from "./errors";

export async function runConvexCall<T>(op: string, call: () => Promise<T>) {
  try {
    return await call();
  } catch (cause) {
    throw new ConvexCallError({ cause, op });
  }
}

export async function wasAborted(
  ctx: ActionCtx,
  args: { threadId: string; generationId: string },
) {
  return runConvexCall("wasAborted", () =>
    ctx.runQuery(internal.ai.thread.state.wasAborted, args),
  );
}

export async function writeSystemError(
  ctx: ActionCtx,
  args: {
    threadId: string;
    generationId: string;
    code: ErrorCode;
  },
) {
  try {
    await runConvexCall("writeSystemError", () =>
      logSystemError(ctx, args.threadId, {
        code: args.code,
        generationId: args.generationId,
        timestamp: Date.now(),
      }),
    );
  } catch (cause) {
    console.error("write-system-error failed", { cause });
  }
}

export async function clearEventsForGeneration(
  ctx: ActionCtx,
  generationId: string,
) {
  await runConvexCall("events.clearForGeneration", () =>
    ctx.runMutation(internal.ai.thread.events.clearForGeneration, {
      generationId,
    }),
  );
}

export async function saveFollowUps(
  ctx: ActionCtx,
  args: { threadId: string; followUpQuestions: string[] },
) {
  await runConvexCall("followUps.save", () =>
    ctx.runMutation(internal.ai.thread.followUps.save, args),
  );
}

export function makeOnChunk(
  ctx: ActionCtx,
  args: { threadId: string; generationId: string },
) {
  const { threadId, generationId } = args;
  let agentWorkingEmitted = false;
  let responseStreamingEmitted = false;
  return async ({ chunk }: { chunk: { type: string } }) => {
    if (!agentWorkingEmitted) {
      agentWorkingEmitted = true;
      await runConvexCall("events.emit", () =>
        ctx.runMutation(internal.ai.thread.events.emit, {
          threadId,
          eventType: "agent_working",
          generationId,
        }),
      );
    }
    if (responseStreamingEmitted) return;
    if (chunk.type !== "text-delta") return;
    responseStreamingEmitted = true;
    await runConvexCall("events.emit", () =>
      ctx.runMutation(internal.ai.thread.events.emit, {
        threadId,
        eventType: "response_streaming",
        generationId,
      }),
    );
  };
}

import type { CustomCtx } from "convex-helpers/server/customFunctions";
import type { Infer } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { Id } from "../../_generated/dataModel";
import type { StreamArgs } from "../../agent/validators";
import type { vListThreadStreams } from "./shared";
import { internal } from "../../_generated/api";
import { asId } from "../../../lib/agent-client/_ids";
import { vStreamArgs } from "../../agent/validators";
import { getPublicFile } from "../../app/file_helpers";
import { authedQuery } from "../../convex_helpers";
import { tryCatch } from "../../lib/utils";
import { getPerferredModelIfAllowed } from "../../user/info";
import { usageCheckedMutation } from "../../user/usage";
import { ErrorCode } from "../stream/error_codes";
import { emitThreadEvent, generateGenerationId } from "./events";
import {
  authorizeAccess,
  logSystemError,
  saveUserMessage,
  validateMessage,
} from "./helpers";
import { vAttachment, vListThreadReturn } from "./shared";
import { getLatestEvent } from "./state";

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/**
 * Inline replacement for `syncStreams` from `lib/agent-client/streaming.ts`.
 * Kept here so the scanned `list` query's handler does not have to flow
 * through that wrapper — the wrapper's body calls `internal.*`, and because
 * the wrapper has no return annotation TS would have to infer its type via
 * `fullApi`, which cycles back through this module. Result is routed
 * through a variable declared with an explicit type (no init) so its
 * inferred type does not propagate `internal.*` back up the cycle. When
 * no `streamArgs` is provided we still emit the empty "list" variant so
 * the validator can require the `streams` field unconditionally.
 */
async function resolveSyncStreams(
  ctx: CustomCtx<typeof authedQuery>,
  threadId: Id<"threads">,
  streamArgs: StreamArgs,
) {
  let result: Infer<typeof vListThreadStreams>;
  if (!streamArgs || streamArgs.kind === "list") {
    const messages = streamArgs
      ? await ctx.runQuery(internal.agent.streams.list, {
          threadId,
          startOrder: streamArgs.startOrder,
        })
      : [];
    result = { kind: "list", messages };
  } else {
    const deltas = await ctx.runQuery(internal.agent.streams.listDeltas, {
      threadId,
      cursors: streamArgs.cursors.map((c) => ({
        streamId: asId<"streamingMessages">(c.streamId),
        cursor: c.cursor,
      })),
    });
    result = { kind: "deltas", deltas };
  }
  return result;
}

async function resolveAttachments(
  ctx: CustomCtx<typeof authedQuery>,
  raw: unknown,
  userId: string,
) {
  if (!isStringArray(raw) || raw.length === 0) {
    return [];
  }
  const fileIds = raw
    .map((id) => ctx.db.normalizeId("files", id))
    .filter((id): id is NonNullable<typeof id> => id !== null);
  const files = await Promise.all(fileIds.map((id) => ctx.db.get(id)));
  return files
    .filter((file): file is NonNullable<typeof file> => file !== null)
    .filter((file) => file.userId === userId)
    .map((file) => getPublicFile(file));
}

export const list = authedQuery({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  returns: vListThreadReturn,
  // The handler's return goes through a `let` declared with an explicit
  // validator-derived type (no initializer, which keeps the eslint rule
  // banning annotated initializers happy). Doing this pins the handler's
  // inferred return type to `Infer<typeof vListThreadReturn>` instead of a
  // shape that flows back through `internal.*` — which would cycle via
  // `fullApi` → this module → handler's return type.
  handler: async (ctx, args) => {
    let result: Infer<typeof vListThreadReturn>;
    const { threadId, paginationOpts, streamArgs } = args;
    if (threadId.trim().length === 0) {
      throw new Error("Empty thread ID");
    }
    const thread = await authorizeAccess(ctx, threadId);
    if (!thread) {
      let streamsFallback: Infer<typeof vListThreadStreams>;
      if (!streamArgs || streamArgs.kind === "list") {
        streamsFallback = { kind: "list", messages: [] };
      } else {
        streamsFallback = { kind: "deltas", deltas: [] };
      }
      result = {
        continueCursor: "",
        isDone: true,
        page: [],
        pageStatus: null,
        splitCursor: null,
        streams: streamsFallback,
      };
      return result;
    }
    const threadIdTyped = thread._id satisfies Id<"threads">;
    const [streams, paginated] = await Promise.all([
      resolveSyncStreams(ctx, threadIdTyped, streamArgs),
      paginationOpts.numItems === 0
        ? Promise.resolve({
            page: [],
            isDone: true,
            continueCursor: paginationOpts.cursor ?? "",
            splitCursor: null,
            pageStatus: null,
          })
        : ctx.runQuery(internal.agent.messages.listMessagesByThreadId, {
            order: "desc",
            threadId: threadIdTyped,
            paginationOpts,
          }),
    ]);
    const enriched = await Promise.all(
      paginated.page.map(async (message) => {
        const attachments = await resolveAttachments(
          ctx,
          message.attachments,
          ctx.user.subject,
        );
        return {
          _id: message._id,
          _creationTime: message._creationTime,
          threadId: message.threadId,
          order: message.order,
          stepOrder: message.stepOrder,
          status: message.status,
          tool: message.tool,
          message: message.message,
          text: message.text,
          reasoning: message.reasoning,
          reasoningDetails: message.reasoningDetails,
          sources: message.sources,
          warnings: message.warnings,
          finishReason: message.finishReason,
          providerMetadata: message.providerMetadata,
          notices: message.notices,
          errors: message.errors,
          error: message.error,
          attachments,
        };
      }),
    );
    result = {
      ...paginated,
      page: enriched,
      streams,
    };
    return result;
  },
});

export const send = usageCheckedMutation({
  args: {
    threadId: v.string(),
    prompt: v.string(),
    attachments: v.optional(v.array(vAttachment)),
  },
  handler: async (ctx, args) => {
    const { threadId, prompt, attachments } = args;
    const numAttachments = attachments?.length ?? 0;
    await validateMessage(ctx, prompt, numAttachments);
    const thread = await authorizeAccess(ctx, threadId);
    if (!thread) {
      throw new ConvexError("Thread not found");
    }
    const latestEvent = await getLatestEvent(ctx, thread._id);
    if (latestEvent !== null) {
      throw new ConvexError("Thread is not idle");
    }
    const model = getPerferredModelIfAllowed(ctx.userPlan, ctx.userInfo?.model);
    const generationId = generateGenerationId();
    const [{ lastMessageId }] = await Promise.all([
      saveUserMessage({
        ctx,
        threadId: thread._id,
        prompt,
        userInfo: ctx.userInfo,
        attachments,
      }),
      ctx.db.patch(thread._id, {
        updatedAt: Date.now(),
        followUpQuestions: [],
      }),
      emitThreadEvent(ctx, {
        threadId: thread._id,
        userId: ctx.user.subject,
        eventType: "user_message_sent",
        generationId,
      }),
    ]);
    const { data: scheduledId, error } = await tryCatch(
      ctx.scheduler.runAfter(0, internal.ai.agents.streamResponse, {
        threadId: thread._id,
        promptMessageId: lastMessageId,
        model,
        generationId,
        userId: ctx.user.subject,
        userPlan: ctx.userPlan.name,
      }),
    );
    if (error) {
      console.error(error);
      await logSystemError(ctx, thread._id, {
        code: ErrorCode.InternalDefect,
        generationId,
        timestamp: Date.now(),
      });
    } else {
      await ctx.db.patch(thread._id, { generationFnId: scheduledId });
    }
  },
});

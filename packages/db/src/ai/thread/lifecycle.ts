import { ConvexError, v } from "convex/values";

import { internal } from "../../_generated/api";
import { authedMutation } from "../../convex_helpers";
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
import { vAttachment } from "./shared";
import { getLatestEvent } from "./state";

export const create = usageCheckedMutation({
  args: {
    prompt: v.string(),
    attachments: v.optional(v.array(vAttachment)),
    clientId: v.string(),
  },
  handler: async (ctx, args) => {
    const { prompt, attachments, clientId } = args;
    const numAttachments = attachments?.length ?? 0;
    await validateMessage(ctx, prompt, numAttachments);
    const threadId = await ctx.db.insert("threads", {
      userId: ctx.user.subject,
      title: "New Chat",
      status: "active",
      pinned: false,
      updatedAt: Date.now(),
      clientId,
    });
    const generationId = generateGenerationId();
    await emitThreadEvent(ctx, {
      threadId,
      userId: ctx.user.subject,
      eventType: "user_message_sent",
      generationId,
    });
    const { lastMessageId } = await saveUserMessage({
      ctx,
      threadId,
      prompt,
      userInfo: ctx.userInfo,
      attachments,
    });
    const model = getPerferredModelIfAllowed(ctx.userPlan, ctx.userInfo?.model);
    const { data: scheduledIds, error } = await tryCatch(
      Promise.all([
        ctx.scheduler.runAfter(0, internal.ai.thread.title.generate, {
          threadId,
          prompt,
        }),
        ctx.scheduler.runAfter(0, internal.ai.agents.streamResponse, {
          threadId,
          promptMessageId: lastMessageId,
          model,
          generationId,
          userId: ctx.user.subject,
          userPlan: ctx.userPlan.name,
        }),
      ]),
    );
    if (error) {
      console.error(error);
      await logSystemError(ctx, threadId, {
        code: ErrorCode.InternalDefect,
        generationId,
        timestamp: Date.now(),
      });
    } else {
      await ctx.db.patch(threadId, { generationFnId: scheduledIds[1] });
    }
    return threadId;
  },
});

// `delete` is a reserved word in JS — export as `remove` and re-alias on the
// client side if we ever want a different name. Convex path: `thread.lifecycle.delete`
// would require `export const delete`, which TypeScript rejects. So we keep
// the export identifier as `remove` but the call site still reads clean.
export const remove = authedMutation({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const { threadId } = args;
    const thread = await authorizeAccess(ctx, threadId);
    if (!thread) {
      throw new ConvexError("Thread not found");
    }
    const latestEvent = await getLatestEvent(ctx, thread._id);
    if (latestEvent !== null) {
      throw new Error(
        "Cannot delete a thread while a response is being generated",
      );
    }
    await ctx.scheduler.runAfter(
      0,
      internal.agent.threads.deleteAllForThreadIdAsync,
      { threadId: thread._id },
    );
  },
});

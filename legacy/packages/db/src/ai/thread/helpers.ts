import type { ModelMessage } from "ai";
import type { CustomCtx } from "convex-helpers/server/customFunctions";
import { parse } from "convex-helpers/validators";
import { ConvexError } from "convex/values";

import type { Doc } from "../../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../../_generated/server";
import type {
  Message,
  MessageWithMetadata,
  SystemError,
} from "../../agent/validators";
import type { authedMutation, authedQuery } from "../../convex_helpers";
import type { usageCheckedMutation } from "../../user/usage";
import type { NoticeCode } from "../stream/notice_codes";
import { saveMessage } from "../../../lib/agent-client";
import { addMessagesHandler } from "../../agent/handlers/add_messages";
import { serializeOrThrow } from "../../agent/mapping";
import { vMessageWithMetadata } from "../../agent/validators";
import { messageSendRateLimit } from "../../limiter";
import { isAdmin } from "../../user/account";

const MAX_ATTACHMENTS_PER_MESSAGE = 10;

/**
 * Look up a thread by either its server `_id` or its client-generated
 * `clientId`. The `/chat/$id` route URL can hold either: clientId during the
 * optimistic window immediately after submit, `_id` once the sidebar thread
 * list points to the real row. Accepting both here means downstream queries
 * (`state.get`, `title.get`, `messages.list`, `followUps.get`, etc.) don't
 * have to branch.
 */
export async function getMetadata(ctx: QueryCtx, threadId: string) {
  const id = ctx.db.normalizeId("threads", threadId);
  if (id) {
    return ctx.db.get(id);
  }
  return ctx.db
    .query("threads")
    .withIndex("clientId", (q) => q.eq("clientId", threadId))
    .first();
}

export async function authorizeAccess(
  ctx:
    | CustomCtx<typeof authedMutation>
    | CustomCtx<typeof authedQuery>
    | CustomCtx<typeof usageCheckedMutation>,
  threadId: string,
) {
  const [thread, isAdminUser] = await Promise.all([
    getMetadata(ctx, threadId),
    isAdmin(ctx, ctx.user.subject),
  ]);
  if (!thread) {
    return null;
  }
  if (isAdminUser) {
    return thread;
  }
  if (thread.userId !== ctx.user.subject) {
    throw new Error("Unauthorized");
  }
  return thread;
}

/**
 * Save messages directly in mutation context — no runMutation hop. Uses
 * `serializeOrThrow` (sync, no ctx/component deps) so the path is clean.
 * Action-context callers must go through `agent.saveMessage` / `.saveMessages`
 * (Convex requires the action→mutation boundary).
 */
async function saveMessagesDirect(
  ctx: MutationCtx,
  threadId: string,
  messages: (ModelMessage | Message)[],
  metadata?: Omit<MessageWithMetadata, "message">[],
) {
  const normalized = ctx.db.normalizeId("threads", threadId);
  if (!normalized) {
    throw new ConvexError(`Thread id ${threadId} failed to normalize`);
  }
  const serialized = messages.map((m, i) =>
    parse(vMessageWithMetadata, {
      ...metadata?.[i],
      message: serializeOrThrow(m),
    }),
  );
  return addMessagesHandler(ctx, {
    threadId: normalized,
    messages: serialized,
    failPendingSteps: false,
  });
}

const EMPTY_ASSISTANT_MESSAGE = {
  role: "assistant" as const,
  content: "",
};

async function saveAnnotationMessage(
  ctx: ActionCtx | MutationCtx,
  threadId: string,
  metadata: Omit<MessageWithMetadata, "message">,
) {
  if ("db" in ctx) {
    await saveMessagesDirect(
      ctx,
      threadId,
      [EMPTY_ASSISTANT_MESSAGE],
      [metadata],
    );
    return;
  }
  await saveMessage(ctx, {
    threadId,
    message: EMPTY_ASSISTANT_MESSAGE,
    metadata,
  });
}

export async function logSystemError(
  ctx: ActionCtx | MutationCtx,
  threadId: string,
  error: SystemError,
) {
  await saveAnnotationMessage(ctx, threadId, { errors: [error] });
}

export async function logSystemNotice(
  ctx: MutationCtx,
  threadId: string,
  code: NoticeCode,
) {
  await saveAnnotationMessage(ctx, threadId, { notices: [{ code }] });
}

export async function validateMessage(
  ctx: CustomCtx<typeof usageCheckedMutation>,
  message: string,
  attachmentLength: number,
) {
  if (message.length > 20000) {
    throw new ConvexError("Message is too long. Please shorten your message.");
  }
  if (attachmentLength > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new ConvexError("You can only attach up to 20 files per message.");
  }
  await messageSendRateLimit(ctx);
  if (ctx.usage.limitHit) {
    throw new ConvexError("User has reached usage limit");
  }
}

interface Attachment {
  key: string;
  name: string;
  mimeType: string;
}

interface SaveUserMessageArgs {
  ctx:
    | CustomCtx<typeof authedMutation>
    | CustomCtx<typeof usageCheckedMutation>;
  threadId: string;
  prompt: string;
  userInfo: Doc<"personalInfo"> | null;
  attachments?: Attachment[];
}

function buildUserProfileParts(userInfo: Doc<"personalInfo">) {
  if (
    !userInfo.name &&
    !userInfo.location &&
    !userInfo.language &&
    !userInfo.notes
  ) {
    return [];
  }
  const fields = [
    userInfo.name ? `The user's name is ${userInfo.name}` : null,
    userInfo.location
      ? `The user's current location is ${userInfo.location}`
      : null,
    userInfo.language
      ? `User would like your response to be in: ${userInfo.language}`
      : null,
    userInfo.notes
      ? `Additional info user would like you to know: ${userInfo.notes}`
      : null,
  ].filter((f): f is string => f !== null);
  if (fields.length === 0) {
    return [];
  }
  return [
    {
      role: "system" as const,
      content: `User profile — ${fields.join("; ")}`,
    },
  ];
}

function buildAttachmentMessages(attachments: Attachment[] | undefined) {
  if (!attachments) {
    return [];
  }
  return attachments.map((attachment) => ({
    role: "system" as const,
    content: `User has attached a file - file name: <${attachment.name}>, mimeType: <${attachment.mimeType}>, file key: <${attachment.key}>`,
  }));
}

export async function saveUserMessage({
  ctx,
  threadId,
  prompt,
  userInfo,
  attachments,
}: SaveUserMessageArgs) {
  const systemParts = userInfo ? buildUserProfileParts(userInfo) : [];
  const attachmentParts = buildAttachmentMessages(attachments);
  const { messages } = await saveMessagesDirect(ctx, threadId, [
    ...systemParts,
    { role: "user", content: prompt },
    ...attachmentParts,
  ]);
  const lastMessage = messages.at(-1);
  if (!lastMessage) {
    throw new ConvexError("Failed to save message");
  }
  const results = await Promise.all(
    attachments?.map((attachment) =>
      ctx.db
        .query("files")
        .withIndex("by_key", (q) => q.eq("key", attachment.key))
        .first(),
    ) ?? [],
  );
  const files = results.filter((file) => file !== null);
  const lastPromptMessage = messages.find(
    (message) => message.message?.content === prompt,
  );
  if (!lastPromptMessage) {
    throw new ConvexError("Failed to save message");
  }
  if (files.length > 0) {
    const messageId = ctx.db.normalizeId("messages", lastPromptMessage._id);
    if (messageId) {
      await ctx.db.patch(messageId, {
        attachments: files.map((file) => file._id),
      });
    }
  }
  return { lastMessageId: lastMessage._id };
}

export async function saveNewTitle({
  ctx,
  threadId,
  title,
}: {
  ctx: MutationCtx | CustomCtx<typeof authedMutation>;
  threadId: string;
  title: string;
}) {
  const thread = await getMetadata(ctx, threadId);
  if (!thread) {
    throw new ConvexError("Thread not found");
  }
  if ("user" in ctx && thread.userId !== ctx.user.subject) {
    throw new Error("Unauthorized");
  }
  await ctx.db.patch(thread._id, { title });
}

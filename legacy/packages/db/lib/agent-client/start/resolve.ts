import type { ModelMessage } from "ai";

import type { Message, MessageDoc } from "../../../src/agent/validators";
import type { ActionCtx, Config, Options } from "../types";
import { asId } from "../_ids";
import { internal } from "../../../src/_generated/api";
import { saveInputMessages } from "../save_input_messages";

export async function resolveUserId(
  ctx: ActionCtx,
  opts: { userId?: string | null },
  threadId: string | undefined,
) {
  if (opts.userId !== undefined && opts.userId !== null) {
    return opts.userId;
  }
  if (!threadId) return undefined;
  const thread = await ctx.runQuery(internal.agent.threads.getThread, {
    threadId: asId<"threads">(threadId),
  });
  return thread?.userId ?? undefined;
}

function emptyInputs(
  promptMessageId: string | undefined,
  pendingMessage: MessageDoc | undefined = undefined,
  savedMessages: MessageDoc[] = [],
) {
  return { promptMessageId, pendingMessage, savedMessages };
}

export async function resolveInputs(
  ctx: ActionCtx,
  args: {
    prompt: string | (ModelMessage | Message)[] | undefined;
    messages: (ModelMessage | Message)[] | undefined;
    promptMessageId: string | undefined;
  },
  opts: Options &
    Config & {
      userId: string | undefined;
      threadId: string | undefined;
      agentName: string;
    },
) {
  const saveMessages = opts.storageOptions?.saveMessages ?? "promptAndOutput";
  if (!opts.threadId || saveMessages === "none") {
    return emptyInputs(args.promptMessageId);
  }
  return saveInputMessages(ctx, {
    ...opts,
    threadId: opts.threadId,
    prompt: args.prompt,
    messages: args.messages,
    promptMessageId: args.promptMessageId,
    storageOptions: { saveMessages },
  });
}

import type {
  GenerateObjectResult,
  LanguageModel,
  StepResult,
  ToolSet,
} from "ai";
import type { PaginationOptions } from "convex/server";

import type {
  MessageStatus,
  MessageWithMetadata,
  StreamArgs,
  ThreadDoc,
} from "../../../src/agent/validators";
import type { SaveMessageArgs, SaveMessagesArgs } from "../messages";
import type { ActionCtx, Config, MutationCtx, QueryCtx } from "../types";
import { asId } from "../_ids";
import { internal } from "../../../src/_generated/api";
import { listMessages, saveMessage, saveMessages } from "../messages";
import { syncStreams } from "../streaming";
import { getThreadMetadata } from "../threads";
import { agentApproveToolCall, agentDenyToolCall } from "./approvals";
import {
  agentDeleteMessage,
  agentDeleteMessageRange,
  agentDeleteMessages,
  agentFinalizeMessage,
  agentSaveObject,
  agentSaveStep,
  agentUpdateMessage,
} from "./message_ops";

type AnyCtx = MutationCtx | ActionCtx;

interface ApprovalArgs {
  threadId: string;
  approvalId: string;
  reason?: string;
}

export abstract class AgentBase {
  abstract options: Config & { name: string; languageModel: LanguageModel };

  async saveMessage(ctx: AnyCtx, args: SaveMessageArgs) {
    return saveMessage(ctx, {
      ...args,
      agentName: this.options.name,
    });
  }

  async saveMessages(ctx: AnyCtx, args: SaveMessagesArgs) {
    return saveMessages(ctx, {
      ...args,
      agentName: this.options.name,
    });
  }

  async listMessages(
    ctx: QueryCtx | AnyCtx,
    args: {
      threadId: string;
      paginationOpts: PaginationOptions;
      excludeToolMessages?: boolean;
      statuses?: MessageStatus[];
    },
  ) {
    return listMessages(ctx, args);
  }

  async syncStreams(
    ctx: QueryCtx | AnyCtx,
    args: {
      threadId: string;
      streamArgs: StreamArgs | undefined;
      includeStatuses?: ("streaming" | "finished" | "aborted")[];
    },
  ) {
    return syncStreams(ctx, args);
  }

  async getThreadMetadata(ctx: QueryCtx | AnyCtx, args: { threadId: string }) {
    return getThreadMetadata(ctx, args);
  }

  async updateThreadMetadata(
    ctx: AnyCtx,
    args: {
      threadId: string;
      patch: Partial<
        Pick<ThreadDoc, "title" | "summary" | "status" | "userId">
      >;
    },
  ) {
    return ctx.runMutation(internal.agent.threads.updateThread, {
      threadId: asId<"threads">(args.threadId),
      patch: args.patch,
    });
  }

  async approveToolCall(ctx: MutationCtx, args: ApprovalArgs) {
    return agentApproveToolCall(this.options.name, ctx, args);
  }

  async denyToolCall(ctx: MutationCtx, args: ApprovalArgs) {
    return agentDenyToolCall(this.options.name, ctx, args);
  }

  async saveStep<TOOLS extends ToolSet>(
    ctx: ActionCtx,
    args: {
      userId?: string;
      threadId: string;
      promptMessageId: string;
      step: StepResult<TOOLS>;
      model?: string;
      provider?: string;
    },
  ) {
    return agentSaveStep<TOOLS>(this.options, ctx, args);
  }

  async saveObject(
    ctx: ActionCtx,
    args: {
      userId: string | undefined;
      threadId: string;
      promptMessageId: string;
      model: string | undefined;
      provider: string | undefined;
      result: GenerateObjectResult<unknown>;
      metadata?: Omit<MessageWithMetadata, "message">;
    },
  ) {
    return agentSaveObject(this.options, ctx, args);
  }

  async finalizeMessage(
    ctx: AnyCtx,
    args: {
      messageId: string;
      result: { status: "failed"; error: string } | { status: "success" };
    },
  ) {
    await agentFinalizeMessage(ctx, args);
  }

  async updateMessage(
    ctx: AnyCtx,
    args: Parameters<typeof agentUpdateMessage>[1],
  ) {
    await agentUpdateMessage(ctx, args);
  }

  async deleteMessages(ctx: AnyCtx, args: { messageIds: string[] }) {
    await agentDeleteMessages(ctx, args);
  }

  async deleteMessage(ctx: AnyCtx, args: { messageId: string }) {
    await agentDeleteMessage(ctx, args);
  }

  async deleteMessageRange(
    ctx: AnyCtx,
    args: {
      threadId: string;
      startOrder: number;
      startStepOrder?: number;
      endOrder: number;
      endStepOrder?: number;
    },
  ) {
    return agentDeleteMessageRange(ctx, args);
  }

  async deleteThreadAsync(
    ctx: AnyCtx,
    args: { threadId: string; pageSize?: number },
  ) {
    await ctx.runMutation(internal.agent.threads.deleteAllForThreadIdAsync, {
      threadId: asId<"threads">(args.threadId),
      limit: args.pageSize,
    });
  }

  async deleteThreadSync(
    ctx: ActionCtx,
    args: { threadId: string; pageSize?: number },
  ) {
    await ctx.runAction(internal.agent.threads.deleteAllForThreadIdSync, {
      threadId: asId<"threads">(args.threadId),
      limit: args.pageSize,
    });
  }
}

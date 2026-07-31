import type { WithoutSystemFields } from "convex/server";

import type { ThreadDoc } from "../../src/agent/validators";
import type { ActionCtx, MutationCtx, QueryCtx } from "./types";
import { internal } from "../../src/_generated/api";
import { asId } from "./_ids";

export async function createThread(
  ctx: ActionCtx,
  args?: { userId?: string | null; title?: string; summary?: string },
) {
  const result = await ctx.runMutation(internal.agent.threads.createThread, {
    userId: args?.userId ?? undefined,
    title: args?.title,
    summary: args?.summary,
  });
  return result._id;
}

export async function getThreadMetadata(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  args: { threadId: string },
) {
  const thread = await ctx.runQuery(internal.agent.threads.getThread, {
    threadId: asId<"threads">(args.threadId),
  });
  if (!thread) {
    throw new Error("Thread not found");
  }
  return thread;
}

export async function updateThreadMetadata(
  ctx: MutationCtx | ActionCtx,
  args: { threadId: string; patch: Partial<WithoutSystemFields<ThreadDoc>> },
) {
  return ctx.runMutation(internal.agent.threads.updateThread, {
    threadId: asId<"threads">(args.threadId),
    patch: args.patch,
  });
}

export async function searchThreadTitles(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  {
    userId,
    query,
    limit,
  }: { userId?: string | undefined; query: string; limit?: number },
) {
  return ctx.runQuery(internal.agent.threads.searchThreadTitles, {
    userId,
    query,
    limit: limit ?? 10,
  });
}

import type { IdGenerator } from "@ai-sdk/provider-utils";
import type { LanguageModel, StopCondition, ToolSet } from "ai";

import type { Agent } from "../index";
import type { ActionCtx, AgentPrompt, Config, Options } from "../types";
import { startGeneration } from "../start";

export type AgentConfig<AgentTools extends ToolSet> = Config & {
  name: string;
  languageModel: LanguageModel;
  instructions?: string;
  tools?: AgentTools;
  stopWhen?:
    | StopCondition<NoInfer<AgentTools>>
    | StopCondition<NoInfer<AgentTools>>[];
};

export interface ThreadOpts {
  userId?: string | null;
  threadId?: string;
}

export interface CommonParams<
  AgentTools extends ToolSet,
  CustomCtx extends object,
> {
  options: AgentConfig<AgentTools>;
  agentForToolCtx: Agent | undefined;
  ctx: ActionCtx & CustomCtx;
  threadOpts: ThreadOpts;
  callOptions?: Options;
}

export async function agentStart<
  AgentTools extends ToolSet,
  CustomCtx extends object,
  TOOLS extends ToolSet | undefined,
  T extends { _internal?: { generateId?: IdGenerator } },
>(params: {
  options: AgentConfig<AgentTools>;
  agentForToolCtx: Agent | undefined;
  ctx: ActionCtx & CustomCtx;
  args: T &
    AgentPrompt & {
      tools?: TOOLS;
      abortSignal?: AbortSignal;
      stopWhen?:
        | StopCondition<TOOLS extends undefined ? AgentTools : TOOLS>
        | StopCondition<TOOLS extends undefined ? AgentTools : TOOLS>[];
    };
  callOptions?: Options & { userId?: string | null; threadId?: string };
}) {
  type Tools = TOOLS extends undefined ? AgentTools : TOOLS;
  const { options, agentForToolCtx, ctx, args, callOptions } = params;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const stopWhen = (args.stopWhen ?? options.stopWhen) as
    | StopCondition<Tools>
    | StopCondition<Tools>[]
    | undefined;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const tools = (args.tools ?? options.tools) as Tools;
  return startGeneration<T, Tools, CustomCtx>(
    ctx,
    {
      ...args,
      tools,
      system: args.system ?? options.instructions,
      stopWhen,
    },
    {
      ...options,
      ...callOptions,
      agentName: options.name,
      agentForToolCtx,
    },
  );
}

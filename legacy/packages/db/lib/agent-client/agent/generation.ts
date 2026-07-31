import type { FlexibleSchema } from "@ai-sdk/provider-utils";
import type {
  GenerateObjectResult,
  StepResult,
  StopCondition,
  ToolSet,
} from "ai";
import { generateObject, generateText } from "ai";

import type { StreamingOptions } from "../delta_streamer";
import type {
  AgentPrompt,
  GenerateObjectArgs,
  GenerationOutputMetadata,
  ObjectMode,
  Options,
  Output,
  StreamingTextArgs,
  TextArgs,
} from "../types";
import type { CommonParams } from "./agent_start";
import { streamText } from "../stream_text";
import { errorToString, willContinue } from "../utils";
import { agentStart } from "./agent_start";

export async function agentGenerateText<
  AgentTools extends ToolSet,
  CustomCtx extends object,
  TOOLS extends ToolSet | undefined = undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OUTPUT extends Output<any, any, any> = never,
>(
  params: CommonParams<AgentTools, CustomCtx> & {
    generateTextArgs: AgentPrompt & TextArgs<AgentTools, TOOLS, OUTPUT>;
  },
) {
  const {
    options,
    agentForToolCtx,
    ctx,
    threadOpts,
    callOptions,
    generateTextArgs,
  } = params;
  const { args, promptMessageId, order, ...call } = await agentStart({
    options,
    agentForToolCtx,
    ctx,
    args: generateTextArgs,
    callOptions: { ...threadOpts, ...callOptions },
  });

  type Tools = TOOLS extends undefined ? AgentTools : TOOLS;
  const steps = new Array<StepResult<Tools>>();
  try {
    const result = await generateText<Tools, OUTPUT>({
      ...args,
      prepareStep: async (stepOpts) => {
        const r = await generateTextArgs.prepareStep?.(stepOpts);
        call.updateModel(r?.model ?? stepOpts.model);
        return r;
      },
      onStepFinish: async (step) => {
        steps.push(step);
        await call.save({ step }, await willContinue(steps, args.stopWhen));
        return generateTextArgs.onStepFinish?.(step);
      },
    });
    const metadata = {
      promptMessageId,
      order,
      savedMessages: call.getSavedMessages(),
      messageId: promptMessageId,
    } satisfies GenerationOutputMetadata;
    return Object.assign(result, metadata);
  } catch (error) {
    await call.fail(errorToString(error));
    throw error;
  }
}

export async function agentStreamText<
  AgentTools extends ToolSet,
  CustomCtx extends object,
  TOOLS extends ToolSet | undefined = undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OUTPUT extends Output<any, any, any> = never,
>(
  params: CommonParams<AgentTools, CustomCtx> & {
    streamTextArgs: AgentPrompt & StreamingTextArgs<AgentTools, TOOLS, OUTPUT>;
    callOptions?: Options & { saveStreamDeltas?: boolean | StreamingOptions };
  },
) {
  type Tools = TOOLS extends undefined ? AgentTools : TOOLS;
  const {
    options,
    agentForToolCtx,
    ctx,
    threadOpts,
    streamTextArgs,
    callOptions,
  } = params;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const stopWhen = (streamTextArgs.stopWhen ?? options.stopWhen) as
    | StopCondition<Tools>
    | StopCondition<Tools>[]
    | undefined;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const tools = (streamTextArgs.tools ?? options.tools) as Tools;
  return streamText<Tools, OUTPUT>(
    ctx,
    {
      ...streamTextArgs,
      model: streamTextArgs.model ?? options.languageModel,
      tools,
      system: streamTextArgs.system ?? options.instructions,
      stopWhen,
    },
    {
      ...threadOpts,
      ...options,
      agentName: options.name,
      agentForToolCtx,
      ...callOptions,
    },
  );
}

export async function agentGenerateObject<
  AgentTools extends ToolSet,
  CustomCtx extends object,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SCHEMA extends FlexibleSchema<unknown> = FlexibleSchema<any>,
  OUTPUT extends ObjectMode = "object",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  RESULT = any,
>(
  params: CommonParams<AgentTools, CustomCtx> & {
    generateObjectArgs: AgentPrompt &
      GenerateObjectArgs<SCHEMA, OUTPUT, RESULT>;
  },
) {
  const {
    options,
    agentForToolCtx,
    ctx,
    threadOpts,
    callOptions,
    generateObjectArgs,
  } = params;
  const { args, promptMessageId, order, fail, save, getSavedMessages } =
    await agentStart({
      options,
      agentForToolCtx,
      ctx,
      args: generateObjectArgs,
      callOptions: { ...threadOpts, ...callOptions },
    });

  try {
    const rawResult = await generateObject(args);
    // The AI SDK's generateObject return type is loose; tighten to RESULT.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const result = rawResult as GenerateObjectResult<RESULT>;

    await save({ object: result });
    const metadata = {
      promptMessageId,
      order,
      savedMessages: getSavedMessages(),
      messageId: promptMessageId,
    } satisfies GenerationOutputMetadata;
    return Object.assign(result, metadata);
  } catch (error) {
    await fail(errorToString(error));
    throw error;
  }
}

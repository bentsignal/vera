import type { FlexibleSchema } from "@ai-sdk/provider-utils";
import type { ToolSet } from "ai";
import { streamObject } from "ai";

import type {
  AgentPrompt,
  GenerationOutputMetadata,
  ObjectMode,
  StreamObjectArgs,
} from "../types";
import type { CommonParams } from "./agent_start";
import { errorToString } from "../utils";
import { agentStart } from "./agent_start";

export async function agentStreamObject<
  AgentTools extends ToolSet,
  CustomCtx extends object,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SCHEMA extends FlexibleSchema<unknown> = FlexibleSchema<any>,
  OUTPUT extends ObjectMode = "object",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  RESULT = any,
>(
  params: CommonParams<AgentTools, CustomCtx> & {
    streamObjectArgs: AgentPrompt & StreamObjectArgs<SCHEMA, OUTPUT, RESULT>;
  },
) {
  const {
    options,
    agentForToolCtx,
    ctx,
    threadOpts,
    callOptions,
    streamObjectArgs,
  } = params;
  const { args, promptMessageId, order, fail, save, getSavedMessages } =
    await agentStart({
      options,
      agentForToolCtx,
      ctx,
      args: streamObjectArgs,
      callOptions: { ...threadOpts, ...callOptions },
    });

  // The AI SDK overload selection chokes on our union of arg shapes; cast to
  // the loose form so we can pass through to the underlying call.
  /* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
  const streamArgs = args as any;
  const stream = streamObject<SCHEMA, OUTPUT, RESULT>({
    ...streamArgs,
    onError: async (error) => {
      console.error(" streamObject onError", error);
      await fail(errorToString(error.error));
      return args.onError?.(error);
    },
    onFinish: async (result) => {
      const toJsonResponse = stream.toTextStreamResponse.bind(stream);
      await save({
        object: {
          object: result.object,
          finishReason: result.error ? "error" : "stop",
          usage: result.usage,
          warnings: result.warnings,
          request: await stream.request,
          response: result.response,
          providerMetadata: result.providerMetadata,
          toJsonResponse,
          reasoning: undefined,
        },
      });
      return args.onFinish?.(result);
    },
  });
  /* eslint-enable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
  const metadata = {
    promptMessageId,
    order,
    savedMessages: getSavedMessages(),
    messageId: promptMessageId,
  } satisfies GenerationOutputMetadata;
  return Object.assign(stream, metadata);
}

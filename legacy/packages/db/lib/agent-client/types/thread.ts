import type { FlexibleSchema, InferSchema } from "@ai-sdk/provider-utils";
import type {
  GenerateObjectResult,
  GenerateTextResult,
  streamObject,
  StreamTextResult,
  ToolSet,
} from "ai";
import type { WithoutSystemFields } from "convex/server";

import type { ThreadDoc } from "../../../src/agent/validators";
import type { StreamingOptions } from "../delta_streamer";
import type {
  GenerateObjectArgs,
  ObjectMode,
  Output,
  StreamingTextArgs,
  StreamObjectArgs,
  TextArgs,
} from "./args";
import type { AgentPrompt, GenerationOutputMetadata, Options } from "./config";

type JSONValue =
  | null
  | string
  | number
  | boolean
  | JSONValue[]
  | { [k: string]: JSONValue };

type ThreadOutputMetadata = Required<GenerationOutputMetadata>;

/**
 * The interface for a thread returned from `createThread` or
 * `continueThread`. Contextual to a thread and/or user.
 */
export interface Thread<DefaultTools extends ToolSet> {
  threadId: string;
  getMetadata: () => Promise<ThreadDoc>;
  updateMetadata: (
    patch: Partial<WithoutSystemFields<ThreadDoc>>,
  ) => Promise<ThreadDoc>;

  generateText<
    TOOLS extends ToolSet | undefined = undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    OUTPUT extends Output<any, any, any> = never,
  >(
    generateTextArgs: AgentPrompt &
      TextArgs<TOOLS extends undefined ? DefaultTools : TOOLS, TOOLS, OUTPUT>,
    options?: Options,
  ): Promise<
    GenerateTextResult<TOOLS extends undefined ? DefaultTools : TOOLS, OUTPUT> &
      ThreadOutputMetadata
  >;

  streamText<
    TOOLS extends ToolSet | undefined = undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    OUTPUT extends Output<any, any, any> = never,
  >(
    streamTextArgs: AgentPrompt &
      StreamingTextArgs<
        TOOLS extends undefined ? DefaultTools : TOOLS,
        TOOLS,
        OUTPUT
      >,
    options?: Options & {
      /**
       * Whether to save incremental data (deltas) from streaming responses.
       * Defaults to false.
       */
      saveStreamDeltas?: boolean | StreamingOptions;
    },
  ): Promise<
    StreamTextResult<TOOLS extends undefined ? DefaultTools : TOOLS, OUTPUT> &
      ThreadOutputMetadata
  >;

  generateObject<
    SCHEMA extends FlexibleSchema<unknown> = FlexibleSchema<JSONValue>,
    OUTPUT extends ObjectMode = InferSchema<SCHEMA> extends string
      ? "enum"
      : "object",
    RESULT = OUTPUT extends "array"
      ? InferSchema<SCHEMA>[]
      : InferSchema<SCHEMA>,
  >(
    generateObjectArgs: AgentPrompt &
      GenerateObjectArgs<SCHEMA, OUTPUT, RESULT>,
    options?: Options,
  ): Promise<GenerateObjectResult<RESULT> & ThreadOutputMetadata>;

  streamObject<
    SCHEMA extends FlexibleSchema<unknown> = FlexibleSchema<JSONValue>,
    OUTPUT extends ObjectMode = InferSchema<SCHEMA> extends string
      ? "enum"
      : "object",
    RESULT = OUTPUT extends "array"
      ? InferSchema<SCHEMA>[]
      : InferSchema<SCHEMA>,
  >(
    streamObjectArgs: AgentPrompt & StreamObjectArgs<SCHEMA, OUTPUT, RESULT>,
    options?: Options,
  ): Promise<
    ReturnType<typeof streamObject<SCHEMA, OUTPUT, RESULT>> &
      ThreadOutputMetadata
  >;
}

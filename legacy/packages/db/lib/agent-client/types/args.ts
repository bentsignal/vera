import type { FlexibleSchema, InferSchema } from "@ai-sdk/provider-utils";
import type {
  generateObject,
  generateText,
  streamObject,
  streamText,
  ToolSet,
} from "ai";
import type { GenericActionCtx, GenericDataModel } from "convex/server";

import type { AgentPrompt } from "./config";

type JSONValue =
  | null
  | string
  | number
  | boolean
  | JSONValue[]
  | { [k: string]: JSONValue };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Output<_T = any, _P = any, _E = any> {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  responseFormat: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseCompleteOutput: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parsePartialOutput: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createElementStreamTransform: any;
}

export type TextArgs<
  AgentTools extends ToolSet,
  TOOLS extends ToolSet | undefined = undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OUTPUT extends Output<any, any, any> = never,
> = Omit<
  Parameters<
    typeof generateText<TOOLS extends undefined ? AgentTools : TOOLS, OUTPUT>
  >[0],
  "model" | "prompt" | "messages"
> & {
  /**
   * The tools to use for the tool calls. Overrides tools specified in the
   * Agent constructor or createThread / continueThread.
   */
  tools?: TOOLS;
} & AgentPrompt;

export type StreamingTextArgs<
  AgentTools extends ToolSet,
  TOOLS extends ToolSet | undefined = undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OUTPUT extends Output<any, any, any> = never,
> = Omit<
  Parameters<
    typeof streamText<TOOLS extends undefined ? AgentTools : TOOLS, OUTPUT>
  >[0],
  "model" | "prompt" | "messages"
> & {
  tools?: TOOLS;
} & AgentPrompt;

export type ObjectMode = "object" | "array" | "enum" | "no-schema";

export type GenerateObjectArgs<
  SCHEMA extends FlexibleSchema<unknown> = FlexibleSchema<JSONValue>,
  OUTPUT extends ObjectMode = InferSchema<SCHEMA> extends string
    ? "enum"
    : "object",
  RESULT = OUTPUT extends "array" ? InferSchema<SCHEMA>[] : InferSchema<SCHEMA>,
> = AgentPrompt &
  Omit<
    Parameters<typeof generateObject<SCHEMA, OUTPUT, RESULT>>[0],
    "model" | "prompt" | "messages"
  > & {
    schema?: SCHEMA;
    enum?: RESULT[];
  };

export type StreamObjectArgs<
  SCHEMA extends FlexibleSchema<unknown> = FlexibleSchema<JSONValue>,
  OUTPUT extends ObjectMode = InferSchema<SCHEMA> extends string
    ? "enum"
    : "object",
  RESULT = OUTPUT extends "array" ? InferSchema<SCHEMA>[] : InferSchema<SCHEMA>,
> = AgentPrompt &
  Omit<
    Parameters<typeof streamObject<SCHEMA, OUTPUT, RESULT>>[0],
    "model" | "prompt" | "messages"
  > & {
    schema?: SCHEMA;
    enum?: RESULT[];
  };

export type MaybeCustomCtx<
  CustomCtx,
  DataModel extends GenericDataModel,
  AgentTools extends ToolSet,
> =
  CustomCtx extends Record<string, unknown>
    ? {
        /**
         * If you have a custom ctx that you use with the Agent
         * (e.g. `new Agent<{ orgId: string }>(...)`) you need to provide
         * this function to add any extra fields.
         */
        customCtx: (
          ctx: GenericActionCtx<DataModel>,
          target: {
            userId?: string | undefined;
            threadId?: string | undefined;
          },
          llmArgs: TextArgs<AgentTools>,
        ) => CustomCtx;
      }
    : { customCtx?: never };

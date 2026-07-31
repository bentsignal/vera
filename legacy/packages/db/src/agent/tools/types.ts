import type { FlexibleSchema, ModelMessage } from "@ai-sdk/provider-utils";
import type { Tool, ToolExecutionOptions } from "ai";
import type { GenericActionCtx, GenericDataModel } from "convex/server";

import type { Agent } from "../../../lib/agent-client/index";

export type ToolCtx<DataModel extends GenericDataModel = GenericDataModel> =
  GenericActionCtx<DataModel> & {
    agent?: Agent;
    userId?: string;
    threadId?: string;
    messageId?: string;
  };

/**
 * Function called to determine whether a tool needs approval before being
 * executed.
 */
export type ToolNeedsApprovalFunctionCtx<
  INPUT,
  Ctx extends ToolCtx = ToolCtx,
> = (
  ctx: Ctx,
  input: INPUT,
  options: {
    toolCallId: string;
    messages: ModelMessage[];
    /** Experimental (can break in patch releases). */
    experimental_context?: unknown;
  },
) => boolean | PromiseLike<boolean>;

export type ToolExecuteFunctionCtx<
  INPUT,
  OUTPUT,
  Ctx extends ToolCtx = ToolCtx,
> = (
  ctx: Ctx,
  input: INPUT,
  options: ToolExecutionOptions,
) => AsyncIterable<OUTPUT> | PromiseLike<OUTPUT>;

export type NeverOptional<N, T> = 0 extends 1 & N
  ? Partial<T>
  : [N] extends [never]
    ? Partial<Record<keyof T, undefined>>
    : T;

export type ToolOutputPropertiesCtx<
  INPUT,
  OUTPUT,
  Ctx extends ToolCtx = ToolCtx,
> = NeverOptional<
  OUTPUT,
  {
    /**
     * Async function called with the tool call's input that produces a
     * result. If `execute` is not provided, the tool will not be executed
     * automatically.
     */
    execute?: ToolExecuteFunctionCtx<INPUT, OUTPUT, Ctx>;
    outputSchema?: FlexibleSchema<OUTPUT>;
  }
>;

export interface ToolInputProperties<INPUT> {
  /**
   * The schema of the input that the tool expects. The language model uses
   * this to generate the input and validate model output.
   */
  inputSchema: FlexibleSchema<INPUT>;
}

/** Tool augmented with the ctx-injection metadata used by createTool. */
export type CtxTool<INPUT, OUTPUT, Ctx extends ToolCtx = ToolCtx> = Tool<
  INPUT,
  OUTPUT
> & {
  __acceptsCtx?: true;
  ctx?: Ctx;
};

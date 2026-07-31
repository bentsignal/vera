import type { ToolResultOutput } from "@ai-sdk/provider-utils";
import type { Tool, ToolExecutionOptions } from "ai";
import { tool } from "ai";

import type { ProviderOptions } from "../validators";
import type {
  CtxTool,
  ToolCtx,
  ToolInputProperties,
  ToolNeedsApprovalFunctionCtx,
  ToolOutputPropertiesCtx,
} from "./types";

const CTX_REQUIRED_ERROR =
  "To use a Convex tool, you must either provide the ctx at definition time" +
  " (dynamically in an action), or use the Agent to call it (which injects" +
  " the ctx, userId and threadId)";

function getCtx<Ctx extends ToolCtx>(t: unknown) {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return (t as { ctx?: Ctx }).ctx;
}

function requireCtx<Ctx extends ToolCtx>(t: unknown) {
  const ctx = getCtx<Ctx>(t);
  if (!ctx) throw new Error(CTX_REQUIRED_ERROR);
  return ctx;
}

interface CreateToolDef<INPUT, OUTPUT, Ctx extends ToolCtx> {
  description?: string;
  title?: string;
  /**
   * Additional provider-specific metadata. Passed through to the provider
   * from the AI SDK.
   */
  providerOptions?: ProviderOptions;
  /**
   * An optional list of input examples that show the language model what
   * the input should look like.
   */
  inputExamples?: { input: NoInfer<INPUT> }[];
  /** Whether the tool needs approval before it can be executed. */
  needsApproval?:
    | boolean
    | ToolNeedsApprovalFunctionCtx<
        [INPUT] extends [never] ? unknown : INPUT,
        Ctx
      >;
  /** Strict mode setting for the tool. */
  strict?: boolean;
  /** Provide the context to use, e.g. when defining the tool at runtime. */
  ctx?: Ctx;
  /** Called when argument streaming starts. */
  onInputStart?: (
    ctx: Ctx,
    options: ToolExecutionOptions,
  ) => void | PromiseLike<void>;
  /** Called when an argument streaming delta is available. */
  onInputDelta?: (
    ctx: Ctx,
    options: { inputTextDelta: string } & ToolExecutionOptions,
  ) => void | PromiseLike<void>;
  /** Called when a tool call can be started. */
  onInputAvailable?: (
    ctx: Ctx,
    options: {
      input: [INPUT] extends [never] ? unknown : INPUT;
    } & ToolExecutionOptions,
  ) => void | PromiseLike<void>;
  /**
   * Optional conversion function that maps the tool result to an output
   * the language model can use. If not provided, the tool result is sent
   * as a JSON object.
   */
  toModelOutput?: (
    ctx: Ctx,
    options: {
      toolCallId: string;
      input: [INPUT] extends [never] ? unknown : INPUT;
      output: 0 extends 1 & OUTPUT
        ? unknown
        : [OUTPUT] extends [never]
          ? unknown
          : NoInfer<OUTPUT>;
    },
  ) => ToolResultOutput | PromiseLike<ToolResultOutput>;
}

type FullCreateToolDef<INPUT, OUTPUT, Ctx extends ToolCtx> = CreateToolDef<
  INPUT,
  OUTPUT,
  Ctx
> &
  ToolInputProperties<INPUT> &
  ToolOutputPropertiesCtx<INPUT, OUTPUT, Ctx>;

function attachLifecycleHooks<INPUT, OUTPUT, Ctx extends ToolCtx>(
  t: Tool<INPUT, OUTPUT>,
  def: FullCreateToolDef<INPUT, OUTPUT, Ctx>,
) {
  if (def.onInputStart) {
    const fn = def.onInputStart;
    t.onInputStart = function (this: Tool<INPUT, OUTPUT>, options) {
      return fn.call(this, requireCtx<Ctx>(this), options);
    };
  }
  if (def.onInputDelta) {
    const fn = def.onInputDelta;
    t.onInputDelta = function (this: Tool<INPUT, OUTPUT>, options) {
      return fn.call(this, requireCtx<Ctx>(this), options);
    };
  }
  if (def.onInputAvailable) {
    const fn = def.onInputAvailable;
    t.onInputAvailable = function (this: Tool<INPUT, OUTPUT>, options) {
      return fn.call(this, requireCtx<Ctx>(this), options);
    };
  }
  if (def.toModelOutput) {
    const fn = def.toModelOutput;
    t.toModelOutput = function (this: Tool<INPUT, OUTPUT>, options) {
      return fn.call(this, requireCtx<Ctx>(this), options);
    };
  }
}

/**
 * Wrapper around the AI SDK `tool` function that injects extra context into
 * the tool call: action context, userId, threadId, and messageId.
 *
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling
 */
export function createTool<INPUT, OUTPUT, Ctx extends ToolCtx = ToolCtx>(
  def: FullCreateToolDef<INPUT, OUTPUT, Ctx>,
) {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!def.inputSchema) {
    throw new Error("To use a Convex tool, you must provide an `inputSchema`");
  }
  if (!def.execute && !def.outputSchema) {
    throw new Error(
      "To use a Convex tool, you must either provide an execute handler" +
        " function, define an outputSchema, or both",
    );
  }

  const t = tool<INPUT, OUTPUT>({
    type: "function",
    __acceptsCtx: true,
    ctx: def.ctx,
    description: def.description,
    title: def.title,
    providerOptions: def.providerOptions,
    inputSchema: def.inputSchema,
    inputExamples: def.inputExamples,
    needsApproval(this: Tool<INPUT, OUTPUT>, input, options) {
      const fn = def.needsApproval;
      if (!fn || typeof fn === "boolean") return Boolean(fn);
      return fn(requireCtx<Ctx>(this), input, options);
    },
    strict: def.strict,
    ...(def.execute
      ? {
          execute(
            this: Tool<INPUT, OUTPUT>,
            input: INPUT,
            options: ToolExecutionOptions,
          ) {
            const execute = def.execute;
            if (!execute) throw new Error("execute should be defined");
            return execute(requireCtx<Ctx>(this), input, options);
          },
        }
      : {}),
    outputSchema: def.outputSchema,
  });

  attachLifecycleHooks(t, def);
  return t;
}

export type { CtxTool };

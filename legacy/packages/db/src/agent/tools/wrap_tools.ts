import type { Tool, ToolSet } from "ai";

import type { CtxTool, ToolCtx } from "./types";

export function wrapTools(ctx: ToolCtx, ...toolSets: (ToolSet | undefined)[]) {
  // eslint-disable-next-line no-restricted-syntax
  const output: Record<string, Tool> = {};
  for (const toolSet of toolSets) {
    if (!toolSet) continue;
    for (const [name, tool] of Object.entries(toolSet)) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const ctxTool = tool as CtxTool<unknown, unknown>;
      if (!ctxTool.__acceptsCtx) {
        output[name] = tool;
      } else {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- CtxTool spreads into the AI SDK Tool shape; ctx is a runtime property not in Tool's type
        output[name] = { ...tool, ctx } as unknown as Tool;
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return output as ToolSet;
}

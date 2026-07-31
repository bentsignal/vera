import type { ToolUIPart, UIDataTypes, UITools } from "ai";

import type { MessageDocWithExtras, UIMessage } from "../types";
import { makeStepStartPart } from "./tool_part_helpers";

/**
 * Push a tool-call UI part (and its preceding step-start marker) onto the
 * parts array.
 *
 * AI SDK's `ToolUIPart` is a per-tool discriminated union keyed on
 * `type: \`tool-\${NAME}\``. We can't express the exact `NAME` from a
 * validator-stored `string` at compile time, so we localise a cast here with
 * a justification rather than infecting the whole call graph.
 */
export function handleToolCall<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  contentPart: { type: "tool-call" } & {
    toolCallId: string;
    toolName: string;
    input?: unknown;
    providerExecuted?: boolean;
  },
  ctx: {
    allParts: UIMessage<METADATA, DATA_PARTS, TOOLS>["parts"];
    message: MessageDocWithExtras<METADATA>;
  },
) {
  ctx.allParts.push(makeStepStartPart());
  const base = {
    type: `tool-${contentPart.toolName}`,
    toolCallId: contentPart.toolCallId,
    input: contentPart.input,
    providerExecuted: contentPart.providerExecuted,
  };
  const toolPart = ctx.message.streaming
    ? { ...base, state: "input-streaming" }
    : {
        ...base,
        state: "input-available",
        callProviderMetadata: ctx.message.providerMetadata,
      };
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- validator-stored tool inputs are `any`; SDK's ToolUIPart is a per-tool union we can't preserve across the validator boundary
  ctx.allParts.push(toolPart as ToolUIPart<TOOLS>);
}

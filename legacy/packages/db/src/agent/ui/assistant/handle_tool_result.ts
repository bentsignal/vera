import type { DynamicToolUIPart, ToolUIPart, UIDataTypes, UITools } from "ai";

import type { MessageDocWithExtras, UIMessage } from "../types";
import {
  findToolPartByCallId,
  getApproval,
  patchToolPart,
} from "./tool_part_helpers";

interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  output?: {
    type: string;
    value?: unknown;
    reason?: string;
  };
  isError?: boolean;
}

interface HandleContext<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
> {
  allParts: UIMessage<METADATA, DATA_PARTS, TOOLS>["parts"];
  message: MessageDocWithExtras<METADATA>;
}

export function handleToolResult<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  contentPart: ToolResultPart,
  ctx: HandleContext<METADATA, DATA_PARTS, TOOLS>,
) {
  const output = contentPart.output;

  // Execution-denied is also pre-extracted (see approvals.ts) so the raw
  // tool-result form is handled here too for the create-from-page path.
  if (output?.type === "execution-denied") {
    applyExecutionDeniedResult(contentPart.toolCallId, output.reason, ctx);
    return;
  }

  const rawOutput = unwrapOutput(output);
  const hasError = contentPart.isError ?? ctx.message.error;
  const errorText = resolveErrorText(ctx.message.error, hasError, rawOutput);

  const call = findToolPartByCallId(ctx.allParts, contentPart.toolCallId);
  if (call) {
    patchExistingCall(call, { hasError, errorText, rawOutput });
    return;
  }

  pushStandalonePart<METADATA, DATA_PARTS, TOOLS>(contentPart, {
    hasError,
    errorText,
    rawOutput,
    ctx,
  });
}

function applyExecutionDeniedResult<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  toolCallId: string,
  reason: string | undefined,
  ctx: HandleContext<METADATA, DATA_PARTS, TOOLS>,
) {
  const call = findToolPartByCallId(ctx.allParts, toolCallId);
  if (!call) return;
  const existing = getApproval(call);
  patchToolPart(call, {
    state: "output-denied",
    approval: existing
      ? { ...existing, approved: false, reason }
      : { id: "", approved: false, reason },
  });
}

function unwrapOutput(output: ToolResultPart["output"]) {
  if (output && "value" in output && typeof output.type === "string") {
    return output.value;
  }
  return output;
}

function resolveErrorText(
  messageError: string | undefined,
  hasError: boolean | string | undefined,
  rawOutput: unknown,
) {
  if (messageError) return messageError;
  if (!hasError) return undefined;
  return stringifyOutput(rawOutput);
}

function patchExistingCall(
  call: ToolUIPart | DynamicToolUIPart,
  update: {
    hasError: boolean | string | undefined;
    errorText: string | undefined;
    rawOutput: unknown;
  },
) {
  if (update.hasError) {
    patchToolPart(call, {
      state: "output-error",
      errorText: update.errorText ?? "Unknown error",
      output: update.rawOutput,
    });
  } else {
    patchToolPart(call, {
      state: "output-available",
      output: update.rawOutput,
    });
  }
}

function pushStandalonePart<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  contentPart: ToolResultPart,
  args: {
    hasError: boolean | string | undefined;
    errorText: string | undefined;
    rawOutput: unknown;
    ctx: HandleContext<METADATA, DATA_PARTS, TOOLS>;
  },
) {
  const base = {
    type: `tool-${contentPart.toolName}`,
    toolCallId: contentPart.toolCallId,
    callProviderMetadata: args.ctx.message.providerMetadata,
    input: undefined,
  };
  const built = args.hasError
    ? {
        ...base,
        state: "output-error",
        errorText: args.errorText ?? "Unknown error",
      }
    : {
        ...base,
        state: "output-available",
        output: args.rawOutput,
      };
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- tool call is on a previous page; the SDK's ToolUIPart is a per-tool union we can't preserve across the validator boundary
  args.ctx.allParts.push(built as ToolUIPart<TOOLS>);
}

function stringifyOutput(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

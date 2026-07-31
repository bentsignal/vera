import type {
  DynamicToolUIPart,
  ProviderMetadata,
  ReasoningUIPart,
  StepStartUIPart,
  TextUIPart,
  ToolUIPart,
  UIDataTypes,
  UITools,
} from "ai";

import type { MessageDocWithExtras, UIMessage } from "../types";

/**
 * AI SDK's `ToolUIPart` is a discriminated union keyed on `state`. Our code
 * transitions a tool part through several states (input-available →
 * approval-requested → output-available, etc.), so the field layout of each
 * variant is incompatible with a single concrete variant type. We localize the
 * unsafe reshaping to these helpers so the rest of the code can keep a strict
 * `ToolUIPart` view.
 */

type AnyToolUIPart = ToolUIPart | DynamicToolUIPart;

export function findToolPartByCallId<
  METADATA = unknown,
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
>(parts: UIMessage<METADATA, DATA_PARTS, TOOLS>["parts"], toolCallId: string) {
  const found = parts.find(
    (part) => "toolCallId" in part && part.toolCallId === toolCallId,
  );
  if (!found) return undefined;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowed by presence of toolCallId which only exists on tool parts
  return found as AnyToolUIPart;
}

export function findToolPartByApprovalId<
  METADATA = unknown,
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
>(parts: UIMessage<METADATA, DATA_PARTS, TOOLS>["parts"], approvalId: string) {
  const found = parts.find((part) => {
    if (!("approval" in part)) return false;
    const approval = part.approval;
    if (approval === undefined) return false;
    if (typeof approval !== "object") return false;
    return "id" in approval && approval.id === approvalId;
  });
  if (!found) return undefined;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowed via `approval` field which only lives on tool parts
  return found as AnyToolUIPart;
}

/**
 * Patch a tool UI part in-place. AI SDK's `ToolUIPart` variants disagree on
 * which fields are allowed per state, so a plain assignment on individual
 * fields fails the discriminated-union check. We route every update through
 * this helper so the cast is localized.
 */
export function patchToolPart(
  part: AnyToolUIPart,
  update: Record<string, unknown>,
) {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- ToolUIPart is a discriminated union; state transitions require reshaping fields
  Object.assign(part as object, update);
}

/**
 * Read the `approval` field from a tool part, which only exists on some
 * variants of the discriminated union.
 */
export function getApproval(part: AnyToolUIPart) {
  if (!("approval" in part)) return undefined;
  return part.approval;
}

export interface PartCommon {
  state: "streaming" | "done";
  providerMetadata?: ProviderMetadata;
}

export function makeReasoningPart(text: string, common: PartCommon) {
  return { type: "reasoning", text, ...common } satisfies ReasoningUIPart;
}

export function makeTextPart(text: string, common: PartCommon) {
  return { type: "text", text, ...common } satisfies TextUIPart;
}

export function makeStepStartPart() {
  return { type: "step-start" } satisfies StepStartUIPart;
}

export function getPartCommon<METADATA>(
  message: MessageDocWithExtras<METADATA>,
) {
  const state = message.streaming ? ("streaming" as const) : ("done" as const);
  if (!message.providerMetadata) {
    return { state } satisfies PartCommon;
  }
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- our validator-inferred providerMetadata uses `any` values; AI SDK's ProviderMetadata uses JSONValue; shape is compatible at runtime
  const providerMetadata = message.providerMetadata as ProviderMetadata;
  return { state, providerMetadata } satisfies PartCommon;
}

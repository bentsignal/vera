import type { DynamicToolUIPart, ProviderMetadata, ToolUIPart } from "ai";

export type AnyToolUIPart = ToolUIPart | DynamicToolUIPart;

export interface ToolPartFields {
  toolName: string;
  toolCallId: string;
  state: DynamicToolUIPart["state"];
  input?: unknown;
  output?: unknown;
  errorText?: string;
  providerExecuted?: boolean;
  callProviderMetadata?: ProviderMetadata;
  preliminary?: boolean;
  approval?: { id: string; approved?: boolean };
}

// Build a dynamic-tool UI part from a discriminated-union-friendly record.
// The union members all agree on the listed keys; we cast once, at the builder
// boundary, because the per-state shapes are too narrow for structural inference
// to relate them back to the shared record type above.
export function buildDynamicToolPart(fields: ToolPartFields) {
  const data = {
    type: "dynamic-tool" as const,
    toolCallId: fields.toolCallId,
    toolName: fields.toolName,
    state: fields.state,
    ...(fields.input !== undefined ? { input: fields.input } : {}),
    ...(fields.output !== undefined ? { output: fields.output } : {}),
    ...(fields.errorText !== undefined ? { errorText: fields.errorText } : {}),
    ...(fields.callProviderMetadata
      ? { callProviderMetadata: fields.callProviderMetadata }
      : {}),
    ...(fields.preliminary !== undefined
      ? { preliminary: fields.preliminary }
      : {}),
    ...(fields.approval ? { approval: fields.approval } : {}),
  };
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- DynamicToolUIPart is a discriminated union on `state`; the caller provides the correct combination for the state they requested.
  return data as DynamicToolUIPart;
}

// Build a static-tool UI part.
export function buildStaticToolPart(fields: ToolPartFields) {
  const data = {
    type: `tool-${fields.toolName}` as const,
    toolCallId: fields.toolCallId,
    state: fields.state,
    ...(fields.input !== undefined ? { input: fields.input } : {}),
    ...(fields.output !== undefined ? { output: fields.output } : {}),
    ...(fields.errorText !== undefined ? { errorText: fields.errorText } : {}),
    ...(fields.providerExecuted !== undefined
      ? { providerExecuted: fields.providerExecuted }
      : {}),
    ...(fields.callProviderMetadata
      ? { callProviderMetadata: fields.callProviderMetadata }
      : {}),
    ...(fields.preliminary !== undefined
      ? { preliminary: fields.preliminary }
      : {}),
    ...(fields.approval ? { approval: fields.approval } : {}),
  };
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- ToolUIPart is a discriminated union on `state`; the caller provides the correct combination for the state they requested.
  return data as ToolUIPart;
}

// Strip the `tool-` prefix from a static tool part type to recover the original tool name.
export function toolNameFromType(type: ToolUIPart["type"]) {
  return type.slice("tool-".length);
}

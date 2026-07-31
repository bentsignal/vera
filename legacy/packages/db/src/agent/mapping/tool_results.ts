import type { JSONValue, ToolResultPart } from "ai";
import type { Infer } from "convex/values";
import { validate } from "convex-helpers/validators";

import type {
  ProviderMetadata,
  ProviderOptions,
  vToolResultPart,
} from "../validators";
import { vToolResultOutput } from "../validators";

type ToolResultOutput = ToolResultPart["output"];

export function normalizeToolOutput(result: string | JSONValue | undefined) {
  if (typeof result === "string") {
    return { type: "text", value: result } satisfies ToolResultOutput;
  }
  if (validate(vToolResultOutput, result)) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return result as ToolResultOutput;
  }
  return { type: "json", value: result ?? null } satisfies ToolResultOutput;
}

export function normalizeToolResult(
  part: ToolResultPart | Infer<typeof vToolResultPart>,
  metadata: {
    providerOptions?: ProviderOptions;
    providerMetadata?: ProviderMetadata;
  },
) {
  const output = part.output
    ? validate(vToolResultOutput, part.output)
      ? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        (part.output as ToolResultOutput)
      : normalizeToolOutput(JSON.stringify(part.output))
    : // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      normalizeToolOutput("result" in part ? part.result : undefined);

  return {
    type: part.type,
    output,
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    ...("isError" in part && part.isError ? { isError: true } : {}),
    ...metadata,
  } satisfies ToolResultPart;
}

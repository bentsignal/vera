import type { TextStreamPart, ToolSet, UIMessageChunk } from "ai";

/**
 * Compressing parts when streaming to save bandwidth in deltas.
 */
export function compressUIMessageChunks(parts: UIMessageChunk[]) {
  // eslint-disable-next-line no-restricted-syntax -- empty array initializer needs annotation so push targets typecheck
  const compressed: UIMessageChunk[] = [];
  for (const part of parts) {
    const last = compressed.at(-1);
    if (part.type === "text-delta" || part.type === "reasoning-delta") {
      if (last?.type === part.type && part.id === last.id) {
        last.delta += part.delta;
      } else {
        compressed.push(part);
      }
    } else {
      compressed.push(part);
    }
  }
  return compressed;
}

export function compressTextStreamParts(parts: TextStreamPart<ToolSet>[]) {
  // eslint-disable-next-line no-restricted-syntax -- empty array initializer needs annotation so push targets typecheck
  const compressed: TextStreamPart<ToolSet>[] = [];
  for (const part of parts) {
    const last = compressed.at(-1);
    if (part.type === "text-delta" || part.type === "reasoning-delta") {
      if (last?.type === part.type && part.id === last.id) {
        last.text += part.text;
      } else {
        compressed.push(part);
      }
    } else if (part.type === "file") {
      compressed.push({
        type: "file",
        file: {
          ...part.file,
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the SDK's `file` type requires `uint8Array: Uint8Array`, but we strip it for transit; runtime consumers tolerate `undefined`.
          uint8Array: undefined as unknown as Uint8Array,
        },
      });
    } else {
      compressed.push(part);
    }
  }
  return compressed;
}

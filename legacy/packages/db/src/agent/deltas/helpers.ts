import type { StreamDelta, StreamMessage } from "../validators";

export function statusFromStreamStatus(status: StreamMessage["status"]) {
  switch (status) {
    case "streaming":
      return "streaming" as const;
    case "finished":
      return "success" as const;
    case "aborted":
      return "failed" as const;
    default:
      return "pending" as const;
  }
}

export function getParts<T extends StreamDelta["parts"][number]>(
  deltas: StreamDelta[],
  fromCursor?: number,
) {
  // eslint-disable-next-line no-restricted-syntax -- generic T has no runtime initializer; the empty array alone would infer `never[]`.
  const parts: T[] = [];
  let cursor = fromCursor ?? 0;
  for (const delta of deltas.sort((a, b) => a.start - b.start)) {
    if (delta.parts.length === 0) {
      console.debug(`Got delta with no parts: ${JSON.stringify(delta)}`);
      continue;
    }
    if (cursor !== delta.start) {
      if (cursor >= delta.end) {
        continue;
      } else if (cursor < delta.start) {
        console.warn(
          `Got delta for stream ${delta.streamId} that has a gap ${cursor} -> ${delta.start}`,
        );
        break;
      } else {
        throw new Error(
          `Got unexpected delta for stream ${delta.streamId}: delta: ${delta.start} -> ${delta.end} existing cursor: ${cursor}`,
        );
      }
    }
    for (const part of delta.parts) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- StreamDelta.parts is validated as v.any() at the persistence boundary; the caller supplies the expected element type via the generic.
      parts.push(part);
    }
    cursor = delta.end;
  }
  return { parts, cursor };
}

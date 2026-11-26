// A small queue, so ten videos don't all fight for the connection (or,
// shrinking, for the encoder).

/** How many uploads run at once across every message. */
const UPLOAD_CONCURRENCY = 3;

let active = 0;
const waiting = new Array<() => void>();

function releaseUploadSlot() {
  active -= 1;
  waiting.shift()?.();
}

/** Runs `work` once one of the upload slots is free. */
export async function withUploadSlot<T>(work: () => Promise<T>) {
  if (active >= UPLOAD_CONCURRENCY) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active += 1;
  return work().then(
    (value) => {
      releaseUploadSlot();
      return value;
    },
    (error: unknown) => {
      releaseUploadSlot();
      throw error;
    },
  );
}

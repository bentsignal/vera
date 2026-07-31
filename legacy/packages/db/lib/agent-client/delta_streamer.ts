import type {
  AsyncIterableStream,
  ChunkDetector,
  StreamTextTransform,
  ToolSet,
} from "ai";
import { smoothStream } from "ai";

import type { Id } from "../../src/_generated/dataModel";
import type { ProviderOptions, StreamDelta } from "../../src/agent/validators";
import type { ActionCtx } from "./types";
import { internal } from "../../src/_generated/api";
import { asId } from "./_ids";

export interface StreamingOptions {
  /**
   * The minimum granularity of deltas to save.
   * Note: this is not a guarantee that every delta will be exactly one line.
   * E.g. if "line" is specified, it won't save any deltas until it encounters
   * a newline character.
   * Defaults to a regex that chunks by punctuation followed by whitespace.
   */
  chunking?: "word" | "line" | RegExp | ChunkDetector;
  /**
   * The minimum number of milliseconds to wait between saving deltas.
   * Defaults to 100.
   */
  throttleMs?: number;
  /**
   * Count-based flush: if this many parts accumulate before the throttle
   * window elapses, flush anyway. Defaults to 10.
   */
  maxPartsPerFlush?: number;
  /**
   * If set to true, this will return immediately, as it would if you weren't
   * saving the deltas. Otherwise, the call will "consume" the stream with
   * .consumeStream(), which waits for the stream to finish before returning.
   *
   * When saving deltas, you're often not interactin with the stream otherwise.
   */
  returnImmediately?: boolean;
}

export const DEFAULT_STREAMING_OPTIONS = {
  // This chunks by sentences / clauses. Punctuation followed by whitespace.
  chunking: /[\p{P}\s]/u,
  throttleMs: 100,
  maxPartsPerFlush: 10,
  returnImmediately: false,
} satisfies StreamingOptions;

/**
 *
 * @param options The options passed to `agent.streamText` to decide whether to
 * save deltas while streaming.
 * @param existing The transforms passed to `agent.streamText` to merge with.
 * @returns The merged transforms to pass to the underlying `streamText` call.
 */
export function mergeTransforms<TOOLS extends ToolSet>(
  options: { chunking?: StreamingOptions["chunking"] } | boolean | undefined,
  existing:
    | StreamTextTransform<TOOLS>
    | StreamTextTransform<TOOLS>[]
    | undefined,
) {
  if (!options) {
    return existing;
  }
  const chunking =
    typeof options === "boolean"
      ? DEFAULT_STREAMING_OPTIONS.chunking
      : options.chunking;
  const transforms = Array.isArray(existing)
    ? existing
    : existing
      ? [existing]
      : [];
  transforms.push(smoothStream({ delayInMs: null, chunking }));
  return transforms;
}

interface DeltaStreamerConfig<T> {
  throttleMs: number | undefined;
  maxPartsPerFlush?: number | undefined;
  onAsyncAbort: (reason: string) => Promise<void>;
  abortSignal: AbortSignal | undefined;
  compress: ((parts: T[]) => T[]) | null;
}

interface DeltaStreamerMetadata {
  threadId: string;
  userId?: string;
  order: number;
  stepOrder: number;
  agentName?: string;
  model?: string;
  provider?: string;
  providerOptions?: ProviderOptions;
  format: "UIMessageChunk" | "TextStreamPart" | undefined;
}

/**
 * DeltaStreamer can be used to save a stream of "parts" by writing
 * batches of them in "deltas" to the database so clients can subscribe
 * (using the syncStreams utility and client hooks) and re-hydrate the stream.
 * You can optionally compress the parts, e.g. concatenating text deltas, to
 * optimize the data in transit.
 */
export class DeltaStreamer<T> {
  streamId: Id<"streamingMessages"> | undefined;
  public readonly config: {
    throttleMs: number;
    maxPartsPerFlush: number;
    onAsyncAbort: (reason: string) => Promise<void>;
    compress: ((parts: T[]) => T[]) | null;
  };
  #nextParts: T[] = [];
  #latestWrite = 0;
  #ongoingWrite: Promise<void> | undefined;
  #cursor = 0;
  public abortController: AbortController;
  // When true, the stream will be finished externally (e.g., atomically via addMessages)
  // and consumeStream should skip calling finish().
  #finishedExternally = false;
  // Avoid race conditions by only creating once
  #creatingStreamIdPromise: Promise<Id<"streamingMessages">> | undefined;

  constructor(
    public readonly ctx: ActionCtx,
    config: DeltaStreamerConfig<T>,
    public readonly metadata: DeltaStreamerMetadata,
  ) {
    this.config = {
      throttleMs: config.throttleMs ?? DEFAULT_STREAMING_OPTIONS.throttleMs,
      maxPartsPerFlush:
        config.maxPartsPerFlush ?? DEFAULT_STREAMING_OPTIONS.maxPartsPerFlush,
      onAsyncAbort: config.onAsyncAbort,
      compress: config.compress,
    };
    this.#nextParts = [];
    this.abortController = new AbortController();
    if (config.abortSignal) {
      config.abortSignal.addEventListener("abort", () => {
        void this.#handleExternalAbort();
      });
    }
  }

  async #handleExternalAbort() {
    try {
      if (this.abortController.signal.aborted) {
        return;
      }
      this.abortController.abort();
      if (this.#creatingStreamIdPromise) {
        await this.#creatingStreamIdPromise;
      }
      if (this.streamId) {
        await this.#ongoingWrite;
        await this.ctx.runMutation(internal.agent.streams.abort, {
          streamId: this.streamId,
          reason: "abortSignal",
        });
      }
    } catch {
      // Best-effort cleanup — the stream will be garbage-collected
      // by the 10-minute timeout if this fails.
    }
  }

  public async getStreamId() {
    if (!this.streamId) {
      this.#creatingStreamIdPromise ??= this.ctx.runMutation(
        internal.agent.streams.create,
        { ...this.metadata, threadId: asId<"threads">(this.metadata.threadId) },
      );
      this.streamId = await this.#creatingStreamIdPromise;
    }
    return this.streamId;
  }

  public async addParts(parts: T[]) {
    if (this.abortController.signal.aborted) {
      return;
    }
    await this.getStreamId();
    this.#nextParts.push(...parts);
    if (this.#ongoingWrite) return;
    const elapsed = Date.now() - this.#latestWrite;
    const shouldFlush =
      elapsed >= this.config.throttleMs ||
      this.#nextParts.length >= this.config.maxPartsPerFlush;
    if (shouldFlush) {
      this.#ongoingWrite = this.#sendDelta();
    }
  }

  public async consumeStream(stream: AsyncIterableStream<T>) {
    for await (const chunk of stream) {
      await this.addParts([chunk]);
    }
    // Skip finish if it will be handled externally (atomically with message save)
    // or if the stream was aborted (e.g., due to a failed delta write).
    if (!this.#finishedExternally && !this.abortController.signal.aborted) {
      await this.finish();
    }
  }

  /**
   * Mark the stream as being finished externally (e.g., atomically via addMessages).
   * When called, consumeStream() will skip calling finish() since it will be
   * handled elsewhere in the same mutation as message saving.
   */
  public markFinishedExternally() {
    this.#finishedExternally = true;
  }

  /**
   * Get the stream ID, waiting for it to be created if necessary.
   * Useful for passing to addMessages for atomic finish.
   */
  public async getOrCreateStreamId() {
    return this.getStreamId();
  }

  async #sendDelta() {
    if (this.abortController.signal.aborted) {
      return;
    }
    const delta = this.#createDelta();
    if (!delta) {
      return;
    }
    this.#latestWrite = Date.now();
    try {
      const success = await this.ctx.runMutation(
        internal.agent.streams.addDelta,
        { ...delta, streamId: asId<"streamingMessages">(delta.streamId) },
      );
      if (!success) {
        await this.config.onAsyncAbort("async abort");
        this.abortController.abort();
        return;
      }
    } catch (e) {
      await this.config.onAsyncAbort(
        e instanceof Error ? e.message : "unknown error",
      );
      this.abortController.abort();
      return;
    }
    if (this.#nextParts.length === 0) {
      this.#ongoingWrite = undefined;
      return;
    }
    const elapsed = Date.now() - this.#latestWrite;
    const shouldChain =
      elapsed >= this.config.throttleMs ||
      this.#nextParts.length >= this.config.maxPartsPerFlush;
    if (shouldChain) {
      this.#ongoingWrite = this.#sendDelta();
    } else {
      this.#ongoingWrite = undefined;
    }
  }

  #createDelta(): StreamDelta | undefined {
    if (this.#nextParts.length === 0) {
      return undefined;
    }
    const start = this.#cursor;
    const end = start + this.#nextParts.length;
    this.#cursor = end;
    const parts = this.config.compress
      ? this.config.compress(this.#nextParts)
      : this.#nextParts;
    this.#nextParts = [];
    if (!this.streamId) {
      throw new Error("Creating a delta before the stream is created");
    }
    return { streamId: this.streamId, start, end, parts };
  }

  public async finish() {
    if (!this.streamId) {
      return;
    }
    await this.#ongoingWrite;
    await this.#sendDelta();
    if (this.abortController.signal.aborted) {
      return;
    }
    await this.ctx.runMutation(internal.agent.streams.finish, {
      streamId: this.streamId,
    });
  }

  public async fail(reason: string) {
    if (this.abortController.signal.aborted) {
      return;
    }
    this.abortController.abort();
    if (!this.streamId) {
      return;
    }
    await this.#ongoingWrite;
    await this.ctx.runMutation(internal.agent.streams.abort, {
      streamId: this.streamId,
      reason,
    });
  }
}

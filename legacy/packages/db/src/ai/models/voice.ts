import { z } from "zod";

import type { TranscriptionModel } from "./types";

export const transcriptionModels = {
  wizper: {
    provider: "fal.ai",
    name: "Wizper (Whisper v3)",
    model: "fal-ai/wizper",
    cost: { in: 0, out: 0, other: 0.00111 },
    // Wizper's backend only accepts HTTP(S) URLs, so we upload to fal storage
    // first and pass the resulting URL.
    getInput: async (audio, { uploadToFal }) => ({
      audio_url: await uploadToFal(audio),
    }),
    getResult: (data: unknown) => {
      const schema = z.object({
        data: z.object({
          text: z.string(),
          chunks: z
            .array(
              z.object({
                text: z.string(),
                timestamp: z.tuple([z.number(), z.number()]),
              }),
            )
            .default([]),
        }),
      });
      const result = schema.safeParse(data);
      if (!result.success) {
        return {
          error: new Error("Failed to parse result", {
            cause: result.error.cause,
          }),
        };
      }
      const { text, chunks } = result.data.data;
      const duration =
        chunks.length > 0 ? chunks.at(-1)?.timestamp[1] : undefined;
      if (duration === undefined) {
        return { error: new Error("Unable to resolve duration") };
      }
      return { text, duration };
    },
  },
  "scribe-v2": {
    provider: "fal.ai",
    name: "Scribe v2",
    model: "fal-ai/elevenlabs/speech-to-text/scribe-v2",
    cost: { in: 0, out: 0, other: 0.008 },
    // Scribe v2 accepts inline base64 data URIs, so we skip the storage
    // upload hop and send the audio directly in the submit payload.
    getInput: async (audio, { toDataUri }) => ({
      audio_url: await toDataUri(audio),
    }),
    getResult: (data: unknown) => {
      const schema = z.object({
        data: z.object({
          text: z.string(),
          words: z
            .array(z.object({ end: z.number().finite().nonnegative() }))
            .default([]),
        }),
      });
      const result = schema.safeParse(data);
      if (!result.success) {
        return {
          error: new Error("Failed to parse result", {
            cause: result.error.cause,
          }),
        };
      }
      const { text, words } = result.data.data;
      const duration = words.length > 0 ? words.at(-1)?.end : undefined;
      if (duration === undefined) {
        return { error: new Error("Unable to resolve duration") };
      }
      return { text, duration };
    },
  },
} as const satisfies Record<string, TranscriptionModel>;

import type {
  EmbeddingModel as EmbeddingModelV2,
  LanguageModel as LanguageModelV2,
} from "ai";
import z from "zod";

interface Model {
  provider: string;
  name: string;
  cost: {
    in: number;
    out: number;
    other: number;
  };
}

export const OpenRouterProviderMetadata = z.object({
  openrouter: z.object({
    usage: z.object({
      cost: z.number(),
    }),
  }),
});

export const GatewayProviderMetadata = z.object({
  gateway: z.object({
    cost: z.string(),
  }),
});

export interface LanguageModel extends Model {
  available: boolean;
  model: LanguageModelV2;
}

export type PublicLanguageModel = Omit<
  LanguageModel,
  "model" | "cost" | "available"
>;

export interface TranscriptionModel extends Model {
  model: `fal-ai/${string}`;
  getInput: (
    audio: Blob,
    // Helpers for turning a raw audio blob into the `input` object that
    // `fal.subscribe` expects. Each transcription model picks the helper that
    // matches its backend's accepted input format — scribe-v2 takes inline data
    // URIs, wizper only takes HTTP(S) URLs (i.e. pre-uploaded to fal storage).
    helpers: {
      uploadToFal: (audio: Blob) => Promise<string>;
      toDataUri: (audio: Blob) => Promise<string>;
    },
  ) => Promise<{ audio_url: string }>;
  getResult: (
    data: unknown,
  ) => { text: string; duration: number } | { error: Error };
}

export interface EmbeddingModel extends Model {
  model: EmbeddingModelV2;
}

export interface ImageGenerationModel extends Model {
  type: "text-to-image" | "image-to-image";
}

export interface FalImageGenerationModel extends ImageGenerationModel {
  model:
    | "fal-ai/imagen4/preview/ultra"
    | "fal-ai/flux-1/krea"
    | "fal-ai/qwen-image-edit"
    | "fal-ai/gemini-25-flash-image/edit"
    | "fal-ai/gemini-25-flash-image";
}

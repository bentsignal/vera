import type { FalImageGenerationModel } from "./types";

export const falImageGenerationModels = {
  krea: {
    provider: "Flux",
    name: "Krea",
    model: "fal-ai/flux-1/krea",
    type: "text-to-image",
    cost: { in: 0, out: 0, other: 0.03 },
  },
  "imagen4-ultra": {
    provider: "Google",
    name: "Imagen 4 Ultra",
    model: "fal-ai/imagen4/preview/ultra",
    type: "text-to-image",
    cost: { in: 0, out: 0, other: 0.06 },
  },
  "fal-ai/qwen-image-edit": {
    provider: "Qwen",
    name: "Qwen Image to Image",
    model: "fal-ai/qwen-image-edit",
    type: "image-to-image",
    cost: { in: 0, out: 0, other: 0.03 },
  },
  "fal-ai/gemini-25-flash-image/edit": {
    provider: "Google",
    name: "Gemini 2.5 Flash Image Edit",
    model: "fal-ai/gemini-25-flash-image/edit",
    type: "image-to-image",
    cost: { in: 0, out: 0, other: 0.04 },
  },
  "fal-ai/gemini-25-flash-image": {
    provider: "Google",
    name: "Gemini 2.5 Flash Image",
    model: "fal-ai/gemini-25-flash-image",
    type: "text-to-image",
    cost: { in: 0, out: 0, other: 0.04 },
  },
} as const satisfies Record<string, FalImageGenerationModel>;
